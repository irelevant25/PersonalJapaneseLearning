<?php
/**
 * Your study data outside the database, and back in.
 *
 * Backups, in backups/ (gitignored; config backups.dir):
 *   academy-2026-09-24.json                the day's copy, taken when the server starts (the last 14 are kept)
 *   academy-before-reset-<time>.json       before a full reset of the kanji progress
 *   academy-before-restore-<time>.json     before setup.php --restore replaces everything
 *   academy-manual-<time>.json             php setup.php --backup
 *   academy-before-migration-<time>.raw.json   every table as it was, before setup.php
 *                                          applies a migration (see backup_write_raw())
 * Each .json holds everything the database knows about you — the kanji
 * progress, the answer log, every exam attempt with its report — and
 * php setup.php --restore=<file> puts it back.
 *
 * The import: the JSON files the app kept before it used a database
 * (progress/kanji.json, progress/kanji-log.jsonl, results/*.json,
 * reports/*.html). setup.php reads them once, into an empty database. They are
 * only read, never changed.
 */

declare(strict_types=1);

const BACKUP_FORMAT = 'japanese-academy-backup';
const DAILY_BACKUP = '/^academy-\d{4}-\d{2}-\d{2}\.json$/D';

/**
 * Where the backups go: backups/ (config backups.dir, or ACADEMY_BACKUPS_DIR).
 * A database named by ACADEMY_DB_NAME without a folder of its own keeps its
 * copies in the temp folder: they must never pass for yours — a throwaway
 * day's copy would stand in for your day's backup and push your oldest copy
 * out of the last 14.
 */
function backup_dir(): string
{
    if (getenv('ACADEMY_DB_NAME') && !getenv('ACADEMY_BACKUPS_DIR')) {
        return str_replace('\\', '/', sys_get_temp_dir()) . '/academy-backups-' . db_name();
    }
    return config_path('backups.dir');
}

/** Is there any of your data in the database? */
function learner_has_data(): bool
{
    return (bool) db_value('SELECT EXISTS (SELECT 1 FROM srs_progress) OR EXISTS (SELECT 1 FROM srs_daily)
        OR EXISTS (SELECT 1 FROM srs_log) OR EXISTS (SELECT 1 FROM exam_attempts)');
}

/** Everything the database knows about you, in one document. */
function backup_data(): array
{
    return db_tx(static fn (): array => [
        'format' => BACKUP_FORMAT,
        'version' => 1,
        'takenAt' => iso_time(now_ms()),
        'database' => db_name(),
        'kanji' => store_export(),
        'log' => store_log_all(),
        'attempts' => exam_attempts_all(),
    ]);
}

/**
 * Writes a backup and returns its path. 'daily' names it after today;
 * anything else is a label with the time: academy-before-reset-20260924-143512-123.json.
 * Written aside first, so a cut-off write never looks like a finished backup.
 */
function backup_write(string $label): string
{
    $dir = backup_dir();
    if (!is_dir($dir) && !mkdir($dir, 0777, true) && !is_dir($dir)) {
        throw new RuntimeException("Cannot create the backup folder $dir");
    }
    $now = now_ms();
    $name = $label === 'daily'
        ? 'academy-' . local_date($now) . '.json'
        : 'academy-' . $label . '-' . local_time($now)->format('Ymd-His-v') . '.json';
    $file = "$dir/$name";
    file_put_atomic($file, json_text(backup_data()) . "\n");
    return $file;
}

/**
 * Before a migration: every table as it is, row by row, whatever its columns.
 * The regular backup reads the tables with this version's queries, which a
 * migration that has not run yet may not match. Put back by hand if ever
 * needed (it is plain JSON, one list of rows per table).
 */
function backup_write_raw(string $label): string
{
    $dir = backup_dir();
    if (!is_dir($dir) && !mkdir($dir, 0777, true) && !is_dir($dir)) {
        throw new RuntimeException("Cannot create the backup folder $dir");
    }
    $tables = [];
    foreach (db_all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name") as $t) {
        $name = $t['table_name'];
        if (in_array($name, ['srs_items', 'exam_questions', 'content_state'], true)) {
            continue; // the study content: rebuilt from data/
        }
        $tables[$name] = json_decode((string) db_value('SELECT coalesce(json_agg(t), \'[]\') FROM "' . str_replace('"', '""', $name) . '" t'), true);
    }
    $now = now_ms();
    $file = "$dir/academy-$label-" . local_time($now)->format('Ymd-His-v') . '.raw.json';
    file_put_atomic($file, json_text(['format' => 'japanese-academy-tables', 'takenAt' => iso_time($now), 'database' => db_name(), 'tables' => $tables]) . "\n");
    return $file;
}

/**
 * The day's backup, if the database holds anything and today has none yet.
 * Keeps the last config('backups.keep') daily copies. Runs when the server
 * starts, and at the first page load of a new day (for a server left running
 * overnight) — never inside an answer.
 */
function backup_daily(): ?string
{
    $file = backup_dir() . '/academy-' . local_date() . '.json';
    if (is_file($file) || !learner_has_data()) {
        return null;
    }
    backup_write('daily');
    $daily = array_values(array_filter(scandir(backup_dir()) ?: [], static fn (string $f): bool => (bool) preg_match(DAILY_BACKUP, $f)));
    sort($daily);
    foreach (array_slice($daily, 0, max(0, count($daily) - (int) config('backups.keep'))) as $old) {
        unlink(backup_dir() . "/$old");
    }
    return $file;
}

/** A backup file, checked to be one. */
function backup_read(string $file): array
{
    $data = read_json($file);
    if (!is_array($data) || ($data['format'] ?? null) !== BACKUP_FORMAT) {
        throw new RuntimeException("$file is not a Japanese Academy backup.");
    }
    return $data;
}

/** Writes a file aside, then renames it into place; retried, as Windows can hold a fresh file for a moment. */
function file_put_atomic(string $file, string $content): void
{
    $tmp = "$file.tmp";
    if (file_put_contents($tmp, $content) !== strlen($content)) {
        throw new RuntimeException("Cannot write $tmp");
    }
    for ($i = 0; ; $i++) {
        try {
            rename($tmp, $file);
            return;
        } catch (ErrorException $e) {
            if ($i >= 8) {
                @unlink($tmp);
                throw $e;
            }
            usleep(25000 * ($i + 1));
        }
    }
}

/* ------------------------------------------------------------ the old files */

/**
 * The files the app kept before it used a database, under $root, as a
 * backup's data. 'problems' lists what could not be read and was left out.
 */
function legacy_read(string $root): array
{
    $data = ['kanji' => null, 'log' => [], 'attempts' => [], 'problems' => []];

    $kanji = "$root/progress/kanji.json";
    if (is_file($kanji)) {
        // an unreadable progress file stops the import: better nothing than half
        $data['kanji'] = read_json($kanji);
        if (!is_array($data['kanji'])) {
            throw new RuntimeException("$kanji is not a progress file.");
        }
    }

    $log = "$root/progress/kanji-log.jsonl";
    if (is_file($log)) {
        foreach (file($log, FILE_IGNORE_NEW_LINES) as $i => $line) {
            if (trim($line) === '') {
                continue;
            }
            $e = json_decode($line, true);
            if (!is_array($e) || !is_string($e['kind'] ?? null) || !is_numeric($e['t'] ?? null)) {
                $data['problems'][] = 'progress/kanji-log.jsonl line ' . ($i + 1) . ': not a log line';
                continue;
            }
            $data['log'][] = $e;
        }
    }

    $results = glob("$root/results/*.json") ?: [];
    sort($results);
    $matched = [];
    foreach ($results as $file) {
        $id = basename($file, '.json');
        try {
            $attempt = read_json($file);
        } catch (Throwable $e) {
            $data['problems'][] = "results/$id.json: unreadable";
            continue;
        }
        if (!is_array($attempt) || ms_from_iso($attempt['finishedAt'] ?? null) === null || !is_array($attempt['summary'] ?? null)) {
            $data['problems'][] = "results/$id.json: not an exam attempt";
            continue;
        }
        $attempt['id'] = $id;
        $report = "$root/reports/$id.html";
        $data['attempts'][] = ['attempt' => $attempt, 'report' => is_file($report) ? file_get_contents($report) : null];
        $matched[$id] = true;
    }
    foreach (glob("$root/reports/*.html") ?: [] as $file) {
        if (!isset($matched[basename($file, '.html')])) {
            $data['problems'][] = 'reports/' . basename($file) . ': no attempt in results/ to go with it';
        }
    }
    return $data;
}

/* ------------------------------------------------------------------ import */

/**
 * Puts study data — a backup's, or the old files' — into the database, in
 * one transaction. $replace empties your data first (a restore); without it
 * the database must not hold any yet, so nothing is ever counted twice.
 */
function learner_import(array $data, bool $replace = false): array
{
    return db_tx(static function () use ($data, $replace): array {
        if ($replace) {
            foreach (['srs_progress', 'srs_daily', 'srs_log', 'exam_attempts'] as $table) {
                db_exec("DELETE FROM $table");
            }
        } elseif (learner_has_data()) {
            throw new RuntimeException('The database already holds study data; nothing was imported.');
        }
        $counts = ['items' => 0, 'days' => 0, 'log' => 0, 'attempts' => 0, 'reports' => 0];

        $k = is_array($data['kanji'] ?? null) ? $data['kanji'] : null;
        if ($k) {
            $s = is_array($k['settings'] ?? null) ? $k['settings'] : [];
            $batch = js_number($s['batchSize'] ?? 5);
            store_save_settings([
                'batchSize' => is_nan((float) $batch) || $batch == 0 ? 5 : max(1, min(20, (int) floor($batch))),
                'lessonTypes' => in_array($s['lessonTypes'] ?? null, ['both', 'kanji', 'vocab'], true) ? $s['lessonTypes'] : 'both',
                'autoplay' => array_key_exists('autoplay', $s) ? js_truthy($s['autoplay']) : true,
            ]);
            foreach (is_array($k['items'] ?? null) ? $k['items'] : [] as $id => $state) {
                store_put((string) $id, is_array($state) ? $state : [], false);
                $counts['items']++;
            }
            foreach (is_array($k['daily'] ?? null) ? $k['daily'] : [] as $day => $d) {
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/D', (string) $day) || !is_array($d)) {
                    continue;
                }
                $n = static fn (string $key): int => is_numeric($d[$key] ?? null) ? (int) $d[$key] : 0;
                db_exec(
                    'INSERT INTO srs_daily (day, lessons, reviews, reviews_correct, practice, practice_correct) VALUES (?, ?, ?, ?, ?, ?)',
                    [(string) $day, $n('lessons'), $n('reviews'), $n('reviewsCorrect'), $n('practice'), $n('practiceCorrect')]
                );
                $counts['days']++;
            }
            // last, so the saves above don't count as a change
            $now = now_ms();
            db_exec(
                'UPDATE srs_settings SET created_at = academy_time(?), updated_at = academy_time(?)',
                [is_numeric($k['createdAt'] ?? null) ? (int) $k['createdAt'] : $now, is_numeric($k['updatedAt'] ?? null) ? (int) $k['updatedAt'] : $now]
            );
        }

        $rows = [];
        foreach (is_array($data['log'] ?? null) ? $data['log'] : [] as $e) {
            if (!is_array($e) || !is_string($e['kind'] ?? null) || !is_numeric($e['t'] ?? null)) {
                continue;
            }
            $details = $e;
            unset($details['t'], $details['kind'], $details['id']);
            $rows[] = [(int) $e['t'], $e['kind'], isset($e['id']) ? js_string($e['id']) : null, $details ?: new stdClass()];
        }
        if ($rows) {
            db_exec(
                'INSERT INTO srs_log (at, kind, item_id, details)
                 SELECT academy_time((r->>0)::bigint), r->>1, r->>2, r->3 FROM json_array_elements(?::json) WITH ORDINALITY AS t(r, n) ORDER BY n',
                [json_text($rows)]
            );
            $counts['log'] = count($rows);
        }

        foreach (is_array($data['attempts'] ?? null) ? $data['attempts'] : [] as $a) {
            if (!is_array($a['attempt'] ?? null)) {
                continue;
            }
            exam_save_attempt($a['attempt'], is_string($a['report'] ?? null) ? $a['report'] : null);
            $counts['attempts']++;
            $counts['reports'] += is_string($a['report'] ?? null) ? 1 : 0;
        }
        return $counts;
    });
}

/** Has setup.php imported the old files already? */
function legacy_imported(): bool
{
    return (bool) db_value("SELECT EXISTS (SELECT 1 FROM imports WHERE source = 'json-files')");
}

/**
 * The first-run import of progress/, results/ and reports/ under $root:
 * only into a database without study data, and only once.
 * Returns what was imported, or a reason it wasn't.
 */
function legacy_import(string $root): array
{
    if (legacy_imported()) {
        return ['skipped' => 'already imported'];
    }
    // before reading any file: a database that holds study data needs none of them
    if (learner_has_data()) {
        return ['skipped' => 'the database already holds study data'];
    }
    $data = legacy_read($root);
    if (!$data['kanji'] && !$data['log'] && !$data['attempts']) {
        return ['skipped' => 'no progress/, results/ or reports/ files to import'];
    }
    return db_tx(static function () use ($data, $root): array {
        $counts = learner_import($data);
        $summary = $counts + ['from' => str_replace('\\', '/', $root), 'problems' => $data['problems']];
        db_exec("INSERT INTO imports (source, summary) VALUES ('json-files', ?::jsonb)", [json_text($summary)]);
        return $summary;
    });
}
