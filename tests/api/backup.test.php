<?php
// Your data outside the database and back: the day's backup, a restore, and
// the one-time import of the old JSON files (from a fixture in a temp folder:
// tests never read progress/, results/ or reports/).
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

before(function (): void {
    test_db();
});

function daily_backups(): array
{
    return array_map('basename', glob(backup_dir() . '/academy-*.json') ?: []);
}

/** The old files, as the app wrote them before it used a database. */
function fixture(): string
{
    $dir = str_replace('\\', '/', sys_get_temp_dir()) . '/academy-test-fixture-' . bin2hex(random_bytes(4));
    foreach (['progress', 'results', 'reports'] as $d) {
        mkdir("$dir/$d", 0777, true);
    }
    $item = array_merge(srs_blank(), ['stage' => 4, 'learnedAt' => 1790154533255, 'nextReview' => 1790168400000, 'synonyms' => ['large']]);
    file_put_contents("$dir/progress/kanji.json", json_text([
        'version' => 1, 'createdAt' => 1790153500962, 'updatedAt' => 1790239383533,
        'settings' => ['batchSize' => 3, 'lessonTypes' => 'both', 'autoplay' => false],
        'items' => ['k:大' => $item, 'k:学' => ['stage' => 2]], // an old record may lack fields
        'daily' => ['2026-09-23' => ['lessons' => 2, 'reviews' => 0, 'reviewsCorrect' => 0, 'practice' => 0, 'practiceCorrect' => 0]],
    ]));
    file_put_contents("$dir/progress/kanji-log.jsonl", implode("\n", [
        '{"t":1790154533257,"kind":"lesson","id":"k:大"}',
        '{"t":1790154533300,"kind":"lesson","id":"k:学"}',
        'not json',
        '{"t":1790239383536,"kind":"review","id":"k:大","meaningWrong":0,"readingWrong":1,"from":1,"to":2}',
    ]) . "\n");
    $id = '2026-09-22T11-09-21-059Z-exam-1790075246120-320199';
    file_put_contents("$dir/results/$id.json", json_text([
        'id' => $id, 'startedAt' => '2026-09-22T11:07:26.000Z', 'finishedAt' => '2026-09-22T11:09:21.059Z',
        'meta' => ['candidate' => 'irelevant'], 'exam' => ['seed' => 'exam-1790075246120-320199', 'size' => 38, 'books' => [1], 'lessons' => [0, 1, 2], 'sections' => ['kana']],
        'summary' => ['total' => 38, 'answered' => 38, 'unanswered' => 0, 'right' => 14, 'wrong' => 24, 'pct' => 36.8, 'grade' => 'F', 'passed' => false, 'passMark' => 70, 'totalMs' => 114886, 'avgMs' => 3023],
        'bySection' => [], 'byLesson' => [], 'byBook' => [], 'responses' => [],
    ]));
    file_put_contents("$dir/reports/$id.html", "<!doctype html><title>the old report</title>\n");
    file_put_contents("$dir/reports/lost.html", '<!doctype html>');
    $GLOBALS['fixtures'][] = $dir;
    return $dir;
}

function tree_hash(string $dir): string
{
    $h = [];
    foreach (['progress', 'results', 'reports'] as $d) {
        foreach (glob("$dir/$d/*") ?: [] as $f) {
            $h[] = basename($f) . ':' . md5_file($f) . ':' . filemtime($f);
        }
    }
    return implode(',', $h);
}

after(function (): void {
    foreach ($GLOBALS['fixtures'] ?? [] as $dir) {
        foreach (glob("$dir/*/*") ?: [] as $f) {
            unlink($f);
        }
        foreach (glob("$dir/*") ?: [] as $d) {
            rmdir($d);
        }
        rmdir($dir);
    }
});

function wipe(): void
{
    foreach (['srs_progress', 'srs_daily', 'srs_log', 'exam_attempts', 'imports'] as $t) {
        db_exec("DELETE FROM $t");
    }
}

test('the day’s backup: nothing to copy in an empty database', function (): void {
    assert_same(null, backup_daily());
    assert_same([], daily_backups());
});

test('the day’s backup: a complete copy, once a day, written aside and renamed', function (): void {
    $now = now_ms();
    store_put('k:大', srs_learn(null, $now));
    store_bump_daily('lesson', true, $now);
    store_log(['kind' => 'lesson', 'id' => 'k:大'], $now);
    $file = backup_daily();
    assert_same(['academy-' . local_date() . '.json'], daily_backups(), 'one finished backup, no .tmp left');
    assert_same(str_replace('\\', '/', backup_dir() . '/academy-' . local_date() . '.json'), str_replace('\\', '/', (string) $file));
    $b = backup_read($file);
    assert_same(1, $b['kanji']['items']['k:大']['stage']);
    assert_same('lesson', $b['log'][0]['kind']);
    assert_same(null, backup_daily(), 'the same day adds nothing');
    assert_same(1, count(daily_backups()));
});

test('a backup says which database it copies', function (): void {
    assert_same(db_name(), backup_data()['database']);
});

test('a database named by ACADEMY_DB_NAME without a backup folder keeps its copies apart from yours', function (): void {
    $dir = (string) getenv('ACADEMY_BACKUPS_DIR');
    putenv('ACADEMY_BACKUPS_DIR'); // unset
    try {
        assert_match('~/academy-backups-' . db_name() . '$~', backup_dir());
        assert_false(str_starts_with(str_replace('\\', '/', backup_dir()), str_replace('\\', '/', ROOT)), 'not in the repository’s backups/');
    } finally {
        putenv("ACADEMY_BACKUPS_DIR=$dir");
    }
    assert_same($dir, str_replace('\\', '/', backup_dir()));
});

test('before a migration: every table copied as it is, whatever its columns', function (): void {
    $file = backup_write_raw('before-migration');
    assert_match('/academy-before-migration-\d{8}-\d{6}-\d{3}\.raw\.json$/', $file);
    $raw = read_json($file);
    assert_same('japanese-academy-tables', $raw['format']);
    assert_same(db_name(), $raw['database']);
    foreach (['migrations', 'srs_settings', 'srs_progress', 'srs_daily', 'srs_log', 'exam_attempts', 'imports'] as $t) {
        assert_true(array_key_exists($t, $raw['tables']), "table $t");
        assert_same((int) db_value("SELECT count(*) FROM $t"), count($raw['tables'][$t]), "rows of $t");
    }
    foreach (['srs_items', 'exam_questions', 'content_state'] as $t) {
        assert_false(array_key_exists($t, $raw['tables']), "$t is rebuilt from data/, not copied");
    }
    assert_same('k:大', $raw['tables']['srs_progress'][0]['item_id']);
    unlink($file);
});

test('the day’s backup: the last 14 are kept', function (): void {
    foreach (range(1, 20) as $d) {
        file_put_contents(backup_dir() . sprintf('/academy-2020-01-%02d.json', $d), '{}');
    }
    file_put_contents(backup_dir() . '/academy-before-reset-20200101-000000-000.json', '{}');
    unlink(backup_dir() . '/academy-' . local_date() . '.json');
    backup_daily();
    $daily = array_values(array_filter(daily_backups(), static fn (string $f): bool => (bool) preg_match(DAILY_BACKUP, $f)));
    assert_same(14, count($daily));
    assert_same('academy-2020-01-08.json', $daily[0], 'the oldest go');
    assert_true(in_array('academy-before-reset-20200101-000000-000.json', daily_backups(), true), 'other backups stay');
});

test('restore: a backup brings everything back, and what was there is backed up first', function (): void {
    $ex = exam_paper(exam_normalize_spec(['size' => 20, 'seed' => 'restore']));
    $answers = array_fill_keys(array_column($ex['questions'], 'id'), ['choice' => 0, 'ms' => 100]);
    [$status] = exam_submit(['spec' => ['size' => 20, 'seed' => 'restore'], 'responses' => $answers]);
    assert_same(200, $status);
    store_put('k:学', array_merge(srs_learn(null, now_ms()), ['notes' => ['meaning' => 'a child under a roof', 'reading' => '']]));
    $file = backup_write('manual');
    $before = [store_export(), store_log_all(), exam_attempts_all()];

    wipe();
    store_put('k:一', srs_learn(null, now_ms()));
    $counts = learner_import(backup_read($file), true);
    assert_same(['items' => 2, 'days' => 1, 'log' => 1, 'attempts' => 1, 'reports' => 1], $counts);
    assert_same($before, [store_export(), store_log_all(), exam_attempts_all()], 'everything as it was');
    assert_same(null, store_item('k:一'), 'what came after the backup is gone');
    assert_throws(static fn () => learner_import(backup_read($file)), '/already holds study data/');
});

test('import of the old files: once, only into an empty database, the files untouched', function (): void {
    wipe();
    $dir = fixture();
    $hash = tree_hash($dir);
    $r = legacy_import($dir);
    assert_same(2, $r['items']);
    assert_same(1, $r['days']);
    assert_same(3, $r['log']);
    assert_same(1, $r['attempts']);
    assert_same(1, $r['reports']);
    assert_same(['progress/kanji-log.jsonl line 3: not a log line', 'reports/lost.html: no attempt in results/ to go with it'], $r['problems']);
    assert_same($hash, tree_hash($dir), 'the files are only read');
    assert_same(['skipped' => 'already imported'], legacy_import($dir));

    $k = store_export();
    assert_same(['batchSize' => 3, 'lessonTypes' => 'both', 'autoplay' => false], $k['settings']);
    assert_same(1790153500962, $k['createdAt']);
    assert_same(1790239383533, $k['updatedAt']);
    assert_same(4, $k['items']['k:大']['stage']);
    assert_same(['large'], $k['items']['k:大']['synonyms']);
    assert_same(array_merge(srs_blank(), ['stage' => 2]), $k['items']['k:学'], 'a short record gets its missing fields');
    assert_same(['t' => 1790239383536, 'kind' => 'review', 'id' => 'k:大', 'meaningWrong' => 0, 'readingWrong' => 1, 'from' => 1, 'to' => 2], store_log_all()[2]);

    // and the server shows it
    $app = start_app();
    $p = call($app['base'], 'GET', '/api/kanji/progress')['body'];
    assert_same(4, $p['items']['k:大']['stage']);
    $hist = call($app['base'], 'GET', '/api/attempts')['body'];
    assert_same([['id' => '2026-09-22T11-09-21-059Z-exam-1790075246120-320199', 'finishedAt' => '2026-09-22T11:09:21.059Z', 'total' => 38, 'right' => 14, 'pct' => 36.8, 'grade' => 'F', 'passed' => false, 'candidate' => 'irelevant']], $hist);
    assert_same("<!doctype html><title>the old report</title>\n", call($app['base'], 'GET', '/report/2026-09-22T11-09-21-059Z-exam-1790075246120-320199')['raw'], 'the old report, as it was');
});

test('import: an unreadable progress file stops it, and nothing is imported', function (): void {
    wipe();
    $dir = fixture();
    file_put_contents("$dir/progress/kanji.json", '{"version": 1, "items": {');
    assert_throws(static fn () => legacy_import($dir), '/kanji\.json is not valid JSON/');
    assert_false(learner_has_data());
});

test('import: with study data in the database, the old files are not even read', function (): void {
    wipe();
    $dir = fixture();
    file_put_contents("$dir/progress/kanji.json", '{"version": 1, "items": {'); // would stop a read
    store_put('k:一', srs_learn(null, now_ms()));
    assert_same(['skipped' => 'the database already holds study data'], legacy_import($dir));
});

test('setup.php: imports a folder it is given, and --check says when all is ready', function (): void {
    wipe();
    $dir = fixture();
    $php = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(ROOT . '/setup.php');
    exec("$php --import=" . escapeshellarg($dir) . ' 2>&1', $out, $code);
    assert_same(0, $code, implode("\n", $out));
    assert_match('/Imported your study history .*2 kanji items, 1 days, 3 answers, 1 exam attempts/', implode("\n", $out));
    exec("$php --check 2>&1", $check, $code);
    assert_same(0, $code, implode("\n", $check));
    assert_match('/^Ready: database academy_test_/', implode("\n", $check));
});
