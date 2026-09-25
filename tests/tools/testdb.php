<?php
/**
 * The tests' throwaway databases (used by tests/run.php and tests/helpers.js):
 *
 *   php tests/tools/testdb.php template       make or update academy_test_template:
 *                                             its tables and the study content from data/
 *   php tests/tools/testdb.php create NAME    a new test database, copied from the template
 *   php tests/tools/testdb.php drop NAME      drop a test database
 *   php tests/tools/testdb.php sweep          drop test databases more than 6 hours old
 *                                             (left behind by a run that was killed)
 *   php tests/tools/testdb.php sql NAME SQL [JSON-PARAMS]
 *                                             run SQL in a test database; prints the rows as JSON
 *
 * It only ever touches databases whose name starts with academy_test_.
 */

declare(strict_types=1);

const TEMPLATE = 'academy_test_template';

$command = $argv[1] ?? '';
$name = $argv[2] ?? '';

// the app's settings for the server and password, with the template as its database
putenv('ACADEMY_DB_NAME=' . TEMPLATE);
require __DIR__ . '/../../src/bootstrap.php';

function test_name(string $name): string
{
    if (!preg_match('/^academy_test_[a-z0-9_]+$/D', $name) || $name === TEMPLATE) {
        fwrite(STDERR, "testdb: not a test database name: $name\n");
        exit(1);
    }
    return $name;
}

switch ($command) {
    case 'template':
        if (db_name() !== TEMPLATE) {
            exit(1);
        }
        db_create();
        $applied = db_migrate();
        $synced = content_sync();
        echo TEMPLATE . ': ' . ($applied || $synced ? 'updated' . ($synced ? " ({$synced['seconds']} s)" : '') : 'up to date') . "\n";
        break;

    case 'create':
        db_create(test_name($name), TEMPLATE);
        db_server()->exec('COMMENT ON DATABASE "' . $name . "\" IS 'academy test " . time() . "'");
        echo "$name\n";
        break;

    case 'drop':
        db_server()->exec('DROP DATABASE IF EXISTS "' . test_name($name) . '" WITH (FORCE)');
        break;

    case 'sweep':
        $server = db_server();
        $rows = $server->query("SELECT datname, shobj_description(oid, 'pg_database') AS note FROM pg_database WHERE datname LIKE 'academy\\_test\\_%'")->fetchAll();
        foreach ($rows as $r) {
            if ($r['datname'] !== TEMPLATE && preg_match('/^academy test (\d+)$/', (string) $r['note'], $m) && (int) $m[1] < time() - 6 * 3600) {
                $server->exec('DROP DATABASE IF EXISTS "' . test_name($r['datname']) . '" WITH (FORCE)');
                echo "dropped {$r['datname']}\n";
            }
        }
        break;

    case 'sql':
        $stmt = db_connect(test_name($name))->prepare($argv[3] ?? '');
        $stmt->execute(db_params(json_decode($argv[4] ?? '[]', true) ?: []));
        echo json_text($stmt->columnCount() ? $stmt->fetchAll() : []), "\n";
        break;

    default:
        fwrite(STDERR, "usage: php tests/tools/testdb.php template | create NAME | drop NAME | sweep | sql NAME SQL [JSON-PARAMS]\n");
        exit(1);
}
