<?php
/**
 * PostgreSQL through PDO. The connection opens with the first query, so the
 * pure parts of the app (the question generator, the catalog) run without one.
 */

declare(strict_types=1);

function db_dsn(?string $name = null): string
{
    return sprintf(
        'pgsql:host=%s;port=%d;dbname=%s;connect_timeout=5;application_name=japanese-academy',
        config('db.host'),
        (int) config('db.port'),
        $name ?? db_name()
    );
}

/** The app's database: config('db.name'), or ACADEMY_DB_NAME for the tests. */
function db_name(): string
{
    return (string) config('db.name');
}

function db_connect(?string $name = null, bool $persistent = false): PDO
{
    $pdo = new PDO(db_dsn($name), (string) config('db.user'), (string) config('db.password'), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_PERSISTENT => $persistent,
    ]);
    $pdo->exec('SET TIME ZONE ' . $pdo->quote(date_default_timezone_get()));
    return $pdo;
}

/**
 * The app's connection. The web server keeps it open from one request to the
 * next: connecting costs more than answering (50–70 ms on Windows, for the
 * password check). A request that ends inside a transaction has it rolled back.
 */
function db(): PDO
{
    static $pdo = null;
    return $pdo ??= db_connect(null, PHP_SAPI === 'cli-server');
}

/** The server's maintenance database, for creating and dropping databases. */
function db_server(): PDO
{
    return db_connect('postgres');
}

/** PDO sends every value as text: spell booleans and floats the way PostgreSQL reads them. */
function db_params(array $params): array
{
    return array_map(static function ($v) {
        if (is_bool($v)) {
            return $v ? 't' : 'f';
        }
        if (is_float($v)) {
            return json_encode($v); // every digit; a plain string cast keeps only 14
        }
        return $v;
    }, $params);
}

function db_query(string $sql, array $params = []): PDOStatement
{
    $stmt = db()->prepare($sql);
    $stmt->execute(db_params($params));
    return $stmt;
}

function db_all(string $sql, array $params = []): array
{
    return db_query($sql, $params)->fetchAll();
}

function db_one(string $sql, array $params = []): ?array
{
    $row = db_query($sql, $params)->fetch();
    return $row === false ? null : $row;
}

function db_value(string $sql, array $params = [])
{
    $value = db_query($sql, $params)->fetchColumn();
    return $value === false ? null : $value;
}

function db_exec(string $sql, array $params = []): int
{
    return db_query($sql, $params)->rowCount();
}

/** Runs $fn in a transaction (or in the one already open) and returns its result. */
function db_tx(callable $fn)
{
    $pdo = db();
    if ($pdo->inTransaction()) {
        return $fn();
    }
    $pdo->beginTransaction();
    try {
        $result = $fn();
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/** Does the database exist? Asked of the server, so it works before the first connection. */
function db_exists(?string $name = null): bool
{
    $stmt = db_server()->prepare('SELECT 1 FROM pg_database WHERE datname = ?');
    $stmt->execute([$name ?? db_name()]);
    return (bool) $stmt->fetchColumn();
}

/** Creates the database (UTF-8) unless it exists. Returns true when it was created. */
function db_create(?string $name = null, ?string $template = null): bool
{
    $name ??= db_name();
    if (!preg_match('/^[A-Za-z0-9_]{1,63}$/', $name)) {
        throw new RuntimeException("Database names here use letters, digits and _ only: $name");
    }
    if (db_exists($name)) {
        return false;
    }
    $sql = 'CREATE DATABASE "' . $name . '" ENCODING \'UTF8\' TEMPLATE ' . ($template ? '"' . $template . '"' : 'template0');
    for ($i = 0; ; $i++) {
        try {
            db_server()->exec($sql);
            return true;
        } catch (PDOException $e) {
            // A template is copied only while nobody is connected to it; another
            // test run may be checking it for a moment (SQLSTATE 55006).
            if (!$template || $e->getCode() !== '55006' || $i >= 50) {
                throw $e;
            }
            usleep(100000);
        }
    }
}

/**
 * Applies the missing migrations from src/migrations (by file name, in order),
 * each in its own transaction. Returns the names just applied.
 */
function db_migrate(): array
{
    $pdo = db();
    $pdo->exec('CREATE TABLE IF NOT EXISTS migrations (
        name       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
    )');
    $done = array_column(db_all('SELECT name FROM migrations'), 'name');
    $files = glob(__DIR__ . '/migrations/*.sql') ?: [];
    sort($files);

    $applied = [];
    foreach ($files as $file) {
        $name = basename($file);
        if (in_array($name, $done, true)) {
            continue;
        }
        db_tx(static function () use ($pdo, $file, $name): void {
            $pdo->exec((string) file_get_contents($file));
            db_exec('INSERT INTO migrations (name) VALUES (?)', [$name]);
        });
        $applied[] = $name;
    }
    return $applied;
}

/** Migrations not yet applied (all of them for a database without the table). */
function db_pending_migrations(): array
{
    $files = array_map('basename', glob(__DIR__ . '/migrations/*.sql') ?: []);
    sort($files);
    $table = db_value("SELECT to_regclass('migrations') IS NOT NULL");
    $done = $table ? array_column(db_all('SELECT name FROM migrations'), 'name') : [];
    return array_values(array_diff($files, $done));
}
