<?php
/**
 * Default settings. What differs on this computer — above all the database
 * password — goes in src/config.local.php, which setup.php writes and git
 * ignores; its values override these. The environment overrides both (see
 * config() in src/bootstrap.php).
 *
 * src/config.local.php looks like this:
 *
 *   <?php return [
 *       'db' => ['host' => 'localhost', 'port' => 5432, 'user' => 'postgres', 'password' => '…'],
 *   ];
 */

declare(strict_types=1);

return [
    // Where the server listens. 127.0.0.1 = this computer only: the app has no
    // login, and it can reset your progress.
    'host' => '127.0.0.1',
    'port' => 3000,

    // PostgreSQL. setup.php creates the database if it doesn't exist yet.
    'db' => [
        'host' => 'localhost',
        'port' => 5432,
        'name' => 'japanese_academy',
        'user' => 'postgres',
        'password' => '',
    ],

    // Time zone of the review times and the daily counts. null = this computer's.
    'timezone' => null,

    // A copy of your study data, taken each day the server starts and before a
    // full reset. A folder relative to the repository, or an absolute path.
    'backups' => [
        'dir' => 'backups',
        'keep' => 14,
    ],
];
