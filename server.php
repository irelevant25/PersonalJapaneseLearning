<?php
/**
 * Japanese Academy server: PHP's built-in web server, with this file as its
 * router and public/ as its web root.
 *
 *   php server.php         checks the database, rebuilds the study content if
 *                          data/ changed, takes today's backup, then serves
 *                          http://127.0.0.1:3000 (host and port: src/config.php)
 *   php server.php --url   only prints that address (for the launchers)
 *
 *   GET  /                    Academy home (the pages and their files come from public/)
 *   GET  /kanji.html          kanji SRS (lessons, reviews, practice)
 *   GET  /exam.html           the exam
 *   GET  /api/meta            exam: sections, lessons, bank size
 *   POST /api/exam            exam: build a paper  { size, books, lessons, sections, seed }
 *   POST /api/submit          exam: score it, store the attempt and its report
 *   GET  /api/attempts        exam: past attempts (newest first)
 *   GET  /report/:id          exam: the HTML report for one attempt
 *   *    /api/kanji/...       kanji SRS — see src/srs/routes.php
 *   GET  /audio/:name         a vocabulary clip from data/audio
 *   GET  /api/health          which database and backup folder this server uses
 */

declare(strict_types=1);

require __DIR__ . '/src/bootstrap.php';
require __DIR__ . '/src/http.php';
require __DIR__ . '/src/srs/routes.php';

if (PHP_SAPI === 'cli') {
    if (in_array('--url', $argv, true)) {
        echo 'http://' . config('host') . ':' . config('port') . "\n";
        exit(0);
    }
    exit(server_run());
}
if (PHP_SAPI !== 'cli-server') {
    http_response_code(404);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$path = $path === '/' ? '/' : rtrim($path, '/');

try {
    if (!server_route($method === 'HEAD' ? 'GET' : $method, $path)) {
        // A file of public/ is the built-in server's to send. Anything else is a
        // 404 here: left to itself, it would answer an unknown path with index.html.
        $public = (string) realpath(__DIR__ . '/public');
        $decoded = rawurldecode($path);
        $file = str_contains($decoded, "\0") ? false : realpath($public . $decoded);
        if ($path === '/' || ($file !== false && is_file($file) && str_starts_with($file, $public . DIRECTORY_SEPARATOR))) {
            return false;
        }
        http_text(404, 'Not found', 'text/plain; charset=utf-8');
    }
} catch (HttpError $e) {
    http_json($e->status, ['error' => $e->getMessage()]);
} catch (PDOException $e) {
    error_log('[db] ' . $e->getMessage());
    http_json(503, ['error' => 'The database is not reachable: ' . $e->getMessage()]);
} catch (Throwable $e) {
    error_log('[server] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    http_json(500, ['error' => $e->getMessage()]);
}

/** Answers the request if one of the app's routes matches; false leaves it to public/. */
function server_route(string $method, string $path): bool
{
    $api = [
        'GET /api/health' => static fn (): array => [200, [
            'ok' => true,
            'database' => db_name(),
            'backups' => str_replace('\\', '/', backup_dir()),
            'contentCurrent' => content_current(),
        ]],
        'GET /api/meta' => static fn (): array => [200, exam_meta()],
        'POST /api/exam' => static fn (): array => [200, exam_start(http_body())],
        'POST /api/submit' => static fn (): array => exam_submit(http_body()),
        'GET /api/attempts' => static fn (): array => [200, array_reverse(exam_history())],
        'GET /api/kanji/progress' => static fn (): array => [200, kanji_progress()],
        'GET /api/kanji/summary' => static fn (): array => [200, kanji_summarize()],
        'POST /api/kanji/learn' => static fn (): array => kanji_learn(http_body()),
        'POST /api/kanji/review' => static fn (): array => kanji_review(http_body()),
        'POST /api/kanji/practice' => static fn (): array => kanji_practice(http_body()),
        'POST /api/kanji/item' => static fn (): array => kanji_edit_item(http_body()),
        'POST /api/kanji/settings' => static fn (): array => kanji_settings(http_body()),
        'POST /api/kanji/reset-item' => static fn (): array => kanji_reset_item(http_body()),
        'POST /api/kanji/reset' => static fn (): array => kanji_reset(http_body()),
    ];
    $route = "$method $path";

    // A server left running overnight: the first page load of a new day takes
    // the day's backup (a page load, never an answer). Once a day it costs a
    // moment; a failure must not cost the page.
    if (in_array($route, ['GET /api/kanji/progress', 'GET /api/kanji/summary', 'GET /api/meta'], true)) {
        try {
            backup_daily();
        } catch (Throwable $e) {
            error_log('[backup] skipped: ' . $e->getMessage());
        }
    }

    if (isset($api[$route])) {
        [$status, $body] = $api[$route]();
        http_json($status, $body);
        return true;
    }
    if ($route === 'GET /api/kanji/catalog') {
        http_json(200, kanji_catalog_json(), ['Cache-Control: no-cache']);
        return true;
    }
    if ($route === 'GET /api/kanji/export') {
        http_json(200, store_export(), ['Content-Disposition: attachment; filename="kanji-progress-' . local_date() . '.json"']);
        return true;
    }
    if ($method === 'GET' && preg_match('~^/report/([^/]+)$~D', $path, $m)) {
        $id = rawurldecode($m[1]);
        if (!preg_match('/^[A-Za-z0-9_-]+$/D', $id)) {
            http_text(400, 'bad id');
        } elseif (($html = exam_report($id)) === null) {
            http_text(404, 'No such report');
        } else {
            http_text(200, $html);
        }
        return true;
    }
    // The clips made by src/build-audio.php. A clip's name never changes (a new
    // recording gets a new name), so the browser may cache it for good.
    if ($method === 'GET' && preg_match('~^/audio/([^/]+)$~D', $path, $m)) {
        $name = rawurldecode($m[1]);
        if (preg_match(CLIP_NAME, $name) && is_file(AUDIO_CLIPS . "/$name")) {
            // the caching headers go out only with a clip, never with a 404
            http_file(AUDIO_CLIPS . "/$name", 'audio/mpeg', ['Cache-Control: public, max-age=31536000, immutable']);
        } else {
            http_text(404, '', 'text/plain; charset=utf-8');
        }
        return true;
    }
    return false;
}

/** php server.php: get the database ready, say what's there, and serve. */
function server_run(): int
{
    $host = (string) config('host');
    $port = (int) config('port');
    $fail = static function (string $message): int {
        fwrite(STDERR, "\n  $message\n\n");
        return 1;
    };

    if (getenv('ACADEMY_DB_NAME') || getenv('ACADEMY_BACKUPS_DIR')) {
        echo "\n  WARNING   : not your usual data (ACADEMY_DB_NAME / ACADEMY_BACKUPS_DIR set)\n";
    }

    try {
        if (!db_exists()) {
            return $fail('The database ' . db_name() . " doesn't exist yet. Run: php setup.php");
        }
        if ($pending = db_pending_migrations()) {
            return $fail('The database needs an update (' . implode(', ', $pending) . '). Run: php setup.php');
        }
        $synced = content_sync(); // rebuilt when data/ or the code that builds from it changed
        try {
            $backup = backup_daily(); // today's copy, before any request
        } catch (PDOException $e) {
            throw $e;
        } catch (Throwable $e) {
            // a full disk or a locked file: say so, and let the owner study anyway
            $backup = null;
            fwrite(STDERR, "\n  backup skipped: {$e->getMessage()}\n");
        }
        $k = kanji_summarize();
        $stats = exam_stats();
        $audio = db_one('SELECT audio_words, audio_voices FROM content_state');
    } catch (PDOException $e) {
        return $fail("Cannot reach the database: {$e->getMessage()}\n  Is PostgreSQL running? The settings are in src/config.local.php (php setup.php writes them).");
    }

    echo "\n  Japanese Academy  →  http://$host:$port\n";
    if ($synced) {
        echo "  content   : rebuilt from data/ ({$synced['items']} items, {$synced['questions']} questions, {$synced['seconds']} s)\n";
    }
    echo "  kanji SRS : {$k['total']} items, {$k['learned']} learned, {$k['reviewsDue']} review(s) due\n";
    echo "  exam      : {$stats['total']} questions across " . count(SECTIONS) . " sections\n";
    echo $audio && $audio['audio_words']
        ? "  audio     : {$audio['audio_words']} words in {$audio['audio_voices']} voices (data/audio)\n"
        : "  audio     : none yet: run php src/build-audio.php (see README)\n";
    echo '  database  : ' . db_name() . ' on ' . config('db.host') . ':' . config('db.port') . "\n";
    if ($backup) {
        echo '  backup    : ' . str_replace('\\', '/', $backup) . "\n";
    }
    echo "\n";

    // Only this computer can reach the app: it has no login, and it can reset progress.
    $server = proc_open(
        [PHP_BINARY, '-d', 'display_errors=stderr', '-S', "$host:$port", '-t', __DIR__ . '/public', __FILE__],
        [STDIN, STDOUT, STDERR],
        $pipes,
        __DIR__
    );
    return is_resource($server) ? proc_close($server) : $fail('Could not start PHP\'s web server.');
}
