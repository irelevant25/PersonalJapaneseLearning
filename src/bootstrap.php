<?php
/**
 * The start of every entry point — server.php, setup.php, the build tools and
 * the tests: settings, time zone, error handling and the app's functions.
 *
 * Plain PHP 8.1+ with the pdo_pgsql, mbstring and intl extensions. No
 * framework and no Composer.
 */

declare(strict_types=1);

if (PHP_VERSION_ID < 80100) {
    file_put_contents('php://stderr', 'Japanese Academy needs PHP 8.1 or newer; this is PHP ' . PHP_VERSION . ' (' . PHP_BINARY . ").\n");
    exit(1);
}

define('ROOT', dirname(__DIR__));

mb_internal_encoding('UTF-8');

// A warning is a bug: fail loudly rather than carry on with a wrong value.
set_error_handler(static function (int $level, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $level)) {
        return false;
    }
    throw new ErrorException($message, 0, $level, $file, $line);
});

/**
 * Settings: src/config.php, overridden by src/config.local.php, overridden by
 * the environment:
 *
 *   HOST, PORT            where the server listens
 *   ACADEMY_DB_NAME       another database (the tests use throwaway ones)
 *   ACADEMY_BACKUPS_DIR   another folder for the backups (the tests use temp folders)
 *
 * $reload reads the files again (setup.php, after it has written config.local.php).
 */
function config(?string $key = null, bool $reload = false)
{
    static $config = null;

    if ($config === null || $reload) {
        $config = require __DIR__ . '/config.php';
        $local = __DIR__ . '/config.local.php';
        if (is_file($local)) {
            $config = array_replace_recursive($config, require $local);
        }
        $env = ['HOST' => ['host'], 'PORT' => ['port'], 'ACADEMY_DB_NAME' => ['db', 'name'], 'ACADEMY_BACKUPS_DIR' => ['backups', 'dir']];
        foreach ($env as $name => $path) {
            $value = getenv($name);
            if ($value !== false && $value !== '') {
                $ref = &$config;
                foreach ($path as $part) {
                    $ref = &$ref[$part];
                }
                $ref = $name === 'PORT' ? (int) $value : $value;
                unset($ref);
            }
        }
    }

    if ($key === null) {
        return $config;
    }
    $value = $config;
    foreach (explode('.', $key) as $part) {
        if (!is_array($value) || !array_key_exists($part, $value)) {
            return null;
        }
        $value = $value[$part];
    }
    return $value;
}

/** A path from the settings: relative ones are relative to the repository. */
function config_path(string $key): string
{
    $path = (string) config($key);
    return preg_match('~^([A-Za-z]:)?[\\\\/]~', $path) ? $path : ROOT . '/' . $path;
}

/**
 * The time zone of review times and daily counts: the setting, or this
 * computer's (ICU knows it on every system; PHP itself would say UTC).
 */
function app_timezone(): string
{
    $tz = (string) config('timezone');
    if ($tz === '' && class_exists('IntlTimeZone')) {
        $id = IntlTimeZone::createDefault()->getID();
        if (in_array($id, DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC), true)) {
            $tz = $id;
        }
    }
    return $tz !== '' ? $tz : 'UTC';
}

date_default_timezone_set(app_timezone());

require __DIR__ . '/util.php';
require __DIR__ . '/db.php';
require __DIR__ . '/speech.php';
require __DIR__ . '/conjugate.php';
require __DIR__ . '/generate.php';
require __DIR__ . '/score.php';
require __DIR__ . '/report.php';
require __DIR__ . '/srs/srs.php';
require __DIR__ . '/srs/catalog.php';
require __DIR__ . '/srs/store.php';
require __DIR__ . '/content.php';
require __DIR__ . '/exam.php';
require __DIR__ . '/backup.php';
