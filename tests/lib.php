<?php
/**
 * What every PHP test file loads first: the isolation of your data, a small
 * test runner (test(), before(), after(), assertions), and the real server
 * started for the API tests.
 *
 * Isolation, as the old isolate() did it: this file points the app at a
 * throwaway database (academy_test_<…>, copied from academy_test_template)
 * and a temp folder for backups, BEFORE the app is loaded — and refuses to go
 * on if the app was loaded first. No test can reach your database or
 * backups/, and none reads progress/, results/ or reports/. The database and
 * the folder are dropped when the file's tests end; ACADEMY_KEEP_TEMP=1 keeps
 * them for a look.
 *
 * tests/run.php runs every test file (php tests/run.php [file…]).
 */

declare(strict_types=1);

const TEST_DB_PREFIX = 'academy_test_';
const TEST_TEMPLATE = 'academy_test_template';

if (defined('ROOT')) {
    throw new RuntimeException('tests/lib.php came too late: the app was loaded before it, with its real settings.');
}

/** A throwaway database's name: a test database, never the template or the real one. */
function test_db_name_ok(string $name): bool
{
    return (bool) preg_match('/^' . TEST_DB_PREFIX . '[a-z0-9_]+$/D', $name) && $name !== TEST_TEMPLATE;
}

(static function (): void {
    if (!test_db_name_ok((string) getenv('ACADEMY_DB_NAME'))) {
        putenv('ACADEMY_DB_NAME=' . TEST_DB_PREFIX . getmypid() . '_' . bin2hex(random_bytes(3)));
    }
    $dir = (string) getenv('ACADEMY_BACKUPS_DIR');
    if (!str_contains(str_replace('\\', '/', $dir), '/academy-test-')) {
        putenv('ACADEMY_BACKUPS_DIR=' . str_replace('\\', '/', sys_get_temp_dir()) . '/academy-test-' . getmypid() . '-' . bin2hex(random_bytes(3)));
    }
})();

require __DIR__ . '/../src/bootstrap.php';

if (!test_db_name_ok(db_name())) {
    throw new RuntimeException('The tests would use the database ' . db_name() . ': refusing.');
}

/* ------------------------------------------------------------ the runner */

$GLOBALS['TESTS'] = ['tests' => [], 'before' => [], 'after' => []];

function test(string $name, callable $fn): void
{
    $GLOBALS['TESTS']['tests'][] = [$name, $fn];
}

function before(callable $fn): void
{
    $GLOBALS['TESTS']['before'][] = $fn;
}

function after(callable $fn): void
{
    $GLOBALS['TESTS']['after'][] = $fn;
}

final class AssertionFailed extends RuntimeException
{
}

function test_show($v): string
{
    return is_string($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : json_encode($v, JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);
}

function fail(string $message): never
{
    throw new AssertionFailed($message);
}

/** Strict equality (===): for arrays the same keys, values and types, in the same order. */
function assert_same($expected, $actual, string $message = ''): void
{
    if ($expected !== $actual) {
        fail(($message !== '' ? "$message\n" : '') . '  expected: ' . test_show($expected) . "\n  actual:   " . test_show($actual));
    }
}

function assert_true($value, string $message = 'expected a true value'): void
{
    if (!$value) {
        fail($message);
    }
}

function assert_false($value, string $message = 'expected a false value'): void
{
    if ($value) {
        fail($message);
    }
}

function assert_match(string $pattern, string $text, string $message = ''): void
{
    if (!preg_match($pattern, $text)) {
        fail(($message !== '' ? "$message\n" : '') . "  $pattern does not match " . test_show(mb_substr($text, 0, 300)));
    }
}

function assert_no_match(string $pattern, string $text, string $message = ''): void
{
    if (preg_match($pattern, $text, $m)) {
        fail(($message !== '' ? "$message\n" : '') . "  $pattern matches " . test_show($m[0]));
    }
}

function assert_throws(callable $fn, string $pattern = '/./'): void
{
    try {
        $fn();
    } catch (AssertionFailed $e) {
        throw $e;
    } catch (Throwable $e) {
        assert_match($pattern, $e->getMessage(), 'the wrong error');
        return;
    }
    fail('expected an error');
}

/** Runs the file's tests; the last line tells tests/run.php the counts. */
function test_run(): int
{
    $pass = $fail = 0;
    $file = basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? ''));
    try {
        foreach ($GLOBALS['TESTS']['before'] as $fn) {
            $fn();
        }
        foreach ($GLOBALS['TESTS']['tests'] as [$name, $fn]) {
            $t = microtime(true);
            try {
                $fn();
                $pass++;
                printf("  ✔ %s (%sms)\n", $name, js_to_fixed((microtime(true) - $t) * 1000, 1));
            } catch (Throwable $e) {
                $fail++;
                printf("  ✖ %s (%sms)\n", $name, js_to_fixed((microtime(true) - $t) * 1000, 1));
                $where = $e instanceof AssertionFailed ? test_where($e) : get_class($e) . ' at ' . str_replace(ROOT, '', $e->getFile()) . ':' . $e->getLine();
                echo '    ' . str_replace("\n", "\n    ", rtrim($e->getMessage())) . "\n    ($where)\n";
            }
        }
    } finally {
        foreach ($GLOBALS['TESTS']['after'] as $fn) {
            try {
                $fn();
            } catch (Throwable $e) {
                echo '  after: ' . $e->getMessage() . "\n";
            }
        }
    }
    echo '##academy ' . json_encode(['file' => $file, 'pass' => $pass, 'fail' => $fail]) . "\n";
    return $fail ? 1 : 0;
}

/** The test file's line an assertion failed on. */
function test_where(Throwable $e): string
{
    foreach ($e->getTrace() as $frame) {
        if (isset($frame['file']) && str_ends_with($frame['file'], '.test.php')) {
            return basename($frame['file']) . ':' . $frame['line'];
        }
    }
    return basename($e->getFile()) . ':' . $e->getLine();
}

// the tests run when the test file itself is done registering them
register_shutdown_function(static function (): void {
    if (!isset($GLOBALS['TEST_RAN']) && $GLOBALS['TESTS']['tests']) {
        $GLOBALS['TEST_RAN'] = true;
        $code = test_run();
        test_cleanup();
        exit($code);
    }
    test_cleanup();
});

/* ------------------------------------------------ the database and the app */

/** This file's throwaway database, copied from the template on first use. */
function test_db(): void
{
    static $made = false;
    if ($made) {
        return;
    }
    if (!db_exists(TEST_TEMPLATE)) {
        throw new RuntimeException('No ' . TEST_TEMPLATE . ' database: run the tests with php tests/run.php, which makes it.');
    }
    db_create(db_name(), TEST_TEMPLATE);
    // when it was made, so a later run can sweep it away if this one never got to
    db_server()->exec('COMMENT ON DATABASE "' . db_name() . "\" IS 'academy test " . time() . "'");
    $made = true;
    $GLOBALS['TEST_DB_MADE'] = true;
}

/** Drops this file's database and temp folder, unless ACADEMY_KEEP_TEMP is set. */
function test_cleanup(): void
{
    foreach ($GLOBALS['TEST_SERVERS'] ?? [] as $stop) {
        $stop();
    }
    $GLOBALS['TEST_SERVERS'] = [];
    if (getenv('ACADEMY_KEEP_TEMP')) {
        return;
    }
    if (!empty($GLOBALS['TEST_DB_MADE']) && test_db_name_ok(db_name())) {
        $GLOBALS['TEST_DB_MADE'] = false;
        try {
            db_server()->exec('DROP DATABASE IF EXISTS "' . db_name() . '" WITH (FORCE)');
        } catch (Throwable $e) {
            echo '  (could not drop ' . db_name() . ': ' . $e->getMessage() . ")\n";
        }
    }
    $dir = backup_dir();
    if (is_dir($dir) && str_contains(str_replace('\\', '/', $dir), '/academy-test-')) {
        foreach (glob("$dir/*") ?: [] as $f) {
            @unlink($f);
        }
        @rmdir($dir);
    }
}

/** A free port on this computer. */
function test_free_port(): int
{
    $s = stream_socket_server('tcp://127.0.0.1:0');
    $port = (int) substr(strrchr(stream_socket_get_name($s, false), ':'), 1);
    fclose($s);
    return $port;
}

/**
 * The real server on a free port, against this file's database and backup
 * folder. Checks it says so before any test talks to it.
 *
 * @return array{base: string}
 */
function start_app(): array
{
    test_db();
    $port = test_free_port();
    // the built-in server logs every request: to a file, as a pipe nobody reads would fill up and stall it
    $log = tempnam(sys_get_temp_dir(), 'academy-server-');
    $null = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
    $proc = proc_open(
        [PHP_BINARY, '-d', 'display_errors=stderr', '-S', "127.0.0.1:$port", '-t', ROOT . '/public', ROOT . '/server.php'],
        [0 => ['file', $null, 'r'], 1 => ['file', $null, 'w'], 2 => ['file', $log, 'a']],
        $pipes,
        ROOT
    );
    if (!is_resource($proc)) {
        throw new RuntimeException('Could not start the server.');
    }
    $base = "http://127.0.0.1:$port";
    $GLOBALS['TEST_SERVERS'][] = static function () use ($proc, $log): void {
        proc_terminate($proc);
        @proc_close($proc);
        @unlink($log);
    };
    for ($i = 0; $i < 100; $i++) {
        $r = @file_get_contents("$base/api/health");
        if ($r !== false) {
            $health = json_decode($r, true);
            if (($health['database'] ?? null) !== db_name() || ($health['backups'] ?? null) !== str_replace('\\', '/', backup_dir())) {
                throw new RuntimeException("The server uses {$health['database']} / {$health['backups']}, not this test's database and folder.");
            }
            return ['base' => $base, 'log' => $log];
        }
        usleep(50000);
    }
    throw new RuntimeException('The server did not start: ' . file_get_contents($log));
}

/** What the server wrote to its error output that isn't its request log: PHP warnings, [server] errors. */
function server_problems(array $app): array
{
    $lines = preg_split('/\R/', (string) @file_get_contents($app['log']));
    return array_values(array_filter($lines, static fn (string $l): bool => (bool) preg_match('/PHP (Fatal|Parse|Warning|Notice|Deprecated)|\[server\]|\[db\]|Uncaught/i', $l)));
}

/**
 * An HTTP request with JSON in and out.
 *
 * @return array{status: int, body: mixed, raw: string, headers: array<string, string>}
 */
function call(string $base, string $method, string $url, $body = null, array $headers = []): array
{
    $ch = curl_init($base . $url);
    $h = $headers;
    if ($body !== null) {
        $h[] = 'Content-Type: application/json';
    }
    $responseHeaders = [];
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $h,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_HEADERFUNCTION => static function ($ch, string $line) use (&$responseHeaders): int {
            if (str_contains($line, ':')) {
                [$k, $v] = explode(':', $line, 2);
                $responseHeaders[strtolower(trim($k))] = trim($v);
            }
            return strlen($line);
        },
    ] + ($body !== null ? [CURLOPT_POSTFIELDS => json_text($body)] : []));
    $raw = curl_exec($ch);
    if ($raw === false) {
        throw new RuntimeException("$method $url: " . curl_error($ch));
    }
    $decoded = json_decode((string) $raw, true);
    return [
        'status' => (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE),
        'body' => json_last_error() === JSON_ERROR_NONE ? $decoded : $raw,
        'raw' => (string) $raw,
        'headers' => $responseHeaders,
    ];
}
