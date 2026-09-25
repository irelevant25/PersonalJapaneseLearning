<?php
/**
 * Sets up the database, and keeps it up to date. Safe to run any time: it only
 * does what is still missing. The launchers (start.ps1, start.sh) run it on
 * every start.
 *
 *   php setup.php                  the whole setup, step by step:
 *                                    1. database settings — asked once, saved in src/config.local.php
 *                                    2. the database — created if it doesn't exist
 *                                    3. its tables — the missing migrations (src/migrations/)
 *                                    4. the study content — rebuilt from data/ when data/ changed
 *                                    5. your study history — the first time, from the JSON files
 *                                       the app used before (progress/, results/, reports/)
 *   php setup.php --db-host=localhost --db-port=5432 --db-user=postgres --db-password=…
 *                                  the same, with the settings given instead of asked
 *                                  (the database's name is in src/config.php: japanese_academy)
 *   php setup.php --check          only report what isn't ready (changes nothing); exit code 1 if anything
 *   php setup.php --sync           rebuild the study content even if data/ didn't change
 *   php setup.php --backup         write a backup of your study data now (backups/)
 *   php setup.php --restore=FILE   replace your study data with a backup's; what is there now
 *                                  is backed up first
 *   php setup.php --import=FOLDER  import progress/, results/ and reports/ from FOLDER
 *                                  (only into a database without study data)
 *
 * The old JSON files are only ever read. Nothing here deletes your data,
 * except --restore, which backs it up first.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

const LOCAL_CONFIG = __DIR__ . '/src/config.local.php';

function say(string $line = ''): void
{
    fwrite(STDOUT, $line . PHP_EOL);
}

function stop(string $message): never
{
    fwrite(STDERR, PHP_EOL . 'setup: ' . $message . PHP_EOL . PHP_EOL);
    exit(1);
}

// PHP itself first: without these the app can't even load.
if (PHP_VERSION_ID < 80100) {
    stop('PHP 8.1 or newer is needed; this is PHP ' . PHP_VERSION . ' (' . PHP_BINARY . ').');
}
$missing = array_values(array_filter(['pdo_pgsql', 'mbstring', 'intl'], static fn (string $ext): bool => !extension_loaded($ext)));
if ($missing) {
    stop('PHP ' . PHP_VERSION . ' (' . PHP_BINARY . ') lacks the extension(s) ' . implode(', ', $missing) . '.'
        . ' Enable them in ' . (php_ini_loaded_file() ?: 'php.ini') . ' (extension=' . implode(', extension=', $missing) . ').');
}

require __DIR__ . '/src/bootstrap.php';

$opts = getopt('', ['check', 'sync', 'backup', 'restore:', 'import:', 'db-host:', 'db-port:', 'db-user:', 'db-password:']);

/** Asks on the terminal; the default on Enter. */
function ask(string $question, string $default = ''): string
{
    fwrite(STDOUT, $question . ($default !== '' ? " [$default]" : '') . ': ');
    $answer = fgets(STDIN);
    if ($answer === false) {
        stop('No answer (no terminal). Give the settings as options: php setup.php --db-host=… --db-port=… --db-user=… --db-password=…');
    }
    $answer = trim($answer);
    return $answer === '' ? $default : $answer;
}

/**
 * Step 1: src/config.local.php — written from the options, or from answers
 * the first time. The connection is tested before anything is saved.
 */
function setup_config(array $opts): void
{
    $given = array_intersect_key($opts, array_flip(['db-host', 'db-port', 'db-user', 'db-password']));
    if (is_file(LOCAL_CONFIG) && !$given) {
        return;
    }
    $current = config('db');
    if (!$given) {
        say('Database settings (PostgreSQL). Enter keeps the value in brackets.');
    }
    $db = [
        'host' => (string) ($given['db-host'] ?? ($given ? $current['host'] : ask('  server', (string) $current['host']))),
        'port' => (int) ($given['db-port'] ?? ($given ? $current['port'] : ask('  port', (string) $current['port']))),
        'user' => (string) ($given['db-user'] ?? ($given ? $current['user'] : ask('  user', (string) $current['user']))),
        'password' => (string) ($given['db-password'] ?? ($given ? $current['password'] : ask('  password'))),
    ];
    if (!preg_match('/^[A-Za-z0-9._:-]{1,100}$/D', $db['host']) || $db['port'] < 1 || $db['port'] > 65535) {
        stop('That server or port is not valid.');
    }
    try {
        new PDO(sprintf('pgsql:host=%s;port=%d;dbname=postgres;connect_timeout=5', $db['host'], $db['port']), $db['user'], $db['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    } catch (PDOException $e) {
        stop('Cannot connect to PostgreSQL with these settings: ' . $e->getMessage());
    }
    $local = is_file(LOCAL_CONFIG) ? require LOCAL_CONFIG : [];
    $local['db'] = array_merge($local['db'] ?? [], $db);
    $php = "<?php\n// This computer's settings, written by setup.php. Git ignores this file: never commit it.\n\nreturn "
        . var_export($local, true) . ";\n";
    if (file_put_contents(LOCAL_CONFIG, $php) === false) {
        stop('Cannot write ' . LOCAL_CONFIG);
    }
    say('Saved the database settings in src/config.local.php.');
    config(null, true); // the rest of this run uses them
}

try {
    // --check: report, change nothing — not even the settings
    if (isset($opts['check'])) {
        if (!is_file(LOCAL_CONFIG)) {
            say('To do: the database settings (src/config.local.php). Run: php setup.php');
            exit(1);
        }
        $todo = [];
        if (!db_exists()) {
            $todo[] = 'create the database ' . db_name();
        } else {
            if ($pending = db_pending_migrations()) {
                $todo[] = 'apply ' . implode(', ', $pending);
            } elseif (!content_current()) {
                $todo[] = 'rebuild the study content from data/';
            }
        }
        say($todo ? 'To do: ' . implode('; ', $todo) . '. Run: php setup.php' : 'Ready: database ' . db_name() . ', tables and study content up to date.');
        exit($todo ? 1 : 0);
    }

    // 1. the settings
    setup_config($opts);

    // 2. the database
    if (db_create()) {
        say('Created the database ' . db_name() . '.');
    }

    // 3. its tables — on a database that holds data, a copy of every table
    //    first, taken without this version's queries (they may expect the new tables)
    $fresh = db_pending_migrations() === array_map('basename', glob(__DIR__ . '/src/migrations/*.sql') ?: []);
    if (!$fresh && db_pending_migrations() && learner_has_data()) {
        say('Backup before the update: ' . backup_write_raw('before-migration'));
    }
    $applied = db_migrate();
    if ($applied) {
        say('Applied: ' . implode(', ', $applied) . '.');
    }

    // 4. the study content
    $synced = content_sync(isset($opts['sync']));
    if ($synced) {
        say("Built the study content: {$synced['items']} kanji items and {$synced['questions']} exam questions ({$synced['seconds']} s).");
    }

    if (isset($opts['backup'])) {
        say('Backup: ' . backup_write('manual'));
    }

    if (isset($opts['restore'])) {
        $file = (string) $opts['restore'];
        $data = backup_read($file);
        say('Backup of what was there: ' . backup_write('before-restore'));
        $counts = learner_import($data, true);
        say("Restored from $file" . (isset($data['database']) ? " (a copy of the database {$data['database']})" : '')
            . ": {$counts['items']} kanji items, {$counts['log']} answers, {$counts['attempts']} exam attempts.");
        exit(0);
    }

    // 5. your study history from the JSON files, the first time
    $explicit = isset($opts['import']);
    $root = $explicit ? rtrim(str_replace('\\', '/', (string) $opts['import']), '/') : ROOT;
    if ($explicit && !is_dir($root)) {
        stop("No folder $root.");
    }
    $backups = glob(backup_dir() . '/academy-*.json') ?: [];
    if (!$explicit && getenv('ACADEMY_DB_NAME')) {
        // The automatic import reads your real folders: only ever into your own database.
    } elseif (!$explicit && !learner_has_data() && !legacy_imported() && $backups) {
        // The files in progress/ etc. stopped changing when the app moved to the
        // database: a backup is newer than they are. The newest by time, not by
        // name (academy-before-reset-… would sort after academy-2026-…).
        usort($backups, static fn (string $a, string $b): int => filemtime($b) <=> filemtime($a));
        say('The database holds no study data, but there are backups. To bring back the newest:');
        say('  php setup.php --restore=' . str_replace('\\', '/', $backups[0]));
    } else {
        $r = legacy_import($root);
        if (isset($r['skipped'])) {
            if ($explicit) {
                say('Nothing imported: ' . $r['skipped'] . '.');
            }
        } else {
            say("Imported your study history from {$r['from']}: {$r['items']} kanji items, {$r['days']} days, "
                . "{$r['log']} answers, {$r['attempts']} exam attempts ({$r['reports']} with a report).");
            foreach ($r['problems'] as $p) {
                say("  left out: $p");
            }
            say('  The files themselves are unchanged; from now on the database holds your progress.');
        }
    }

    say('Ready: database ' . db_name() . ' on ' . config('db.host') . ':' . config('db.port') . '. Start the app with: php server.php');
} catch (PDOException $e) {
    stop('Database error: ' . $e->getMessage());
} catch (Throwable $e) {
    stop($e->getMessage());
}
