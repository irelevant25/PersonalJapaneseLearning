<?php
/**
 * Runs the PHP tests: tests/unit/*.test.php and tests/api/*.test.php. Each file
 * runs in its own PHP process with its own throwaway database, copied from
 * academy_test_template (made or updated here first), and its own temp folder
 * for backups — see tests/lib.php. Four files run at a time.
 *
 *   php tests/run.php                              every file
 *   php tests/run.php tests/unit/srs.test.php …    some files
 *
 * npm test runs this and the Node tests of the browser code.
 */

declare(strict_types=1);

$root = dirname(__DIR__);
$files = array_slice($argv, 1);
if (!$files) {
    $files = array_merge(glob("$root/tests/unit/*.test.php") ?: [], glob("$root/tests/api/*.test.php") ?: []);
}
$started = microtime(true);
$tmp = str_replace('\\', '/', sys_get_temp_dir());
$null = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';

// the template database: every file's database is a copy of it
foreach (['sweep', 'template'] as $step) {
    passthru(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg("$root/tests/tools/testdb.php") . " $step", $code);
    if ($code) {
        fwrite(STDERR, "Could not prepare the test database (is PostgreSQL running? php setup.php checks the settings).\n");
        exit(1);
    }
}

$env = getenv();
$queue = array_values($files);
$running = [];
$done = [];
$next = 0;
$run = static function (int $i) use (&$running, $queue, $env, $root, $tmp, $null): void {
    $out = tempnam($tmp, 'academy-test-out-');
    $proc = proc_open(
        [PHP_BINARY, $queue[$i]],
        [0 => ['file', $null, 'r'], 1 => ['file', $out, 'w'], 2 => ['redirect', 1]],
        $pipes,
        $root,
        ['ACADEMY_DB_NAME' => 'academy_test_' . getmypid() . "_$i", 'ACADEMY_BACKUPS_DIR' => "$tmp/academy-test-" . getmypid() . "-$i"] + $env
    );
    $running[$i] = [$proc, $out];
};

while ($next < count($queue) || $running) {
    while ($next < count($queue) && count($running) < 4) {
        $run($next++);
    }
    foreach ($running as $i => [$proc, $out]) {
        $status = proc_get_status($proc);
        if (!$status['running']) {
            proc_close($proc);
            $done[$i] = (string) file_get_contents($out);
            @unlink($out);
            unset($running[$i]);
        }
    }
    usleep(20000);
}

$pass = $fail = 0;
foreach ($queue as $i => $file) {
    $rel = str_replace('\\', '/', substr(realpath($file) ?: $file, strlen(realpath($root)) + 1));
    echo "▶ $rel\n";
    $output = $done[$i];
    if (preg_match('/^##academy (.+)$/m', $output, $m)) {
        $counts = json_decode($m[1], true);
        $pass += $counts['pass'];
        $fail += $counts['fail'];
        $output = str_replace($m[0] . "\n", '', $output);
    } else {
        $fail++;
        $output .= "  ✖ the file did not finish\n";
    }
    echo $output;
}
printf("ℹ tests %d\nℹ pass %d\nℹ fail %d\nℹ duration_ms %s\n", $pass + $fail, $pass, $fail, round((microtime(true) - $started) * 1000));
exit($fail ? 1 : 0);
