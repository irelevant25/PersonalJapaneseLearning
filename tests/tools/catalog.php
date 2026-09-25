<?php
// The kanji trainer's catalog, built from data/ (no database needed): what
// tests/unit/answer.test.js checks the browser's answer checking against.
declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

echo json_text(catalog_build(content_load()));
