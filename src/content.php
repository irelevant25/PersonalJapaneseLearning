<?php
/**
 * The study content in the database.
 *
 * data/ holds the content (built from data/source/ by src/build-data.php, plus
 * the audio index and the hand-written exam items). From it this file builds
 * the kanji trainer's catalog and the exam's question bank — about two seconds
 * of work — and stores both in srs_items and exam_questions, so a request only
 * reads rows.
 *
 * content_sync() runs when the server starts and in setup.php. It rebuilds only
 * when data/ or the code that builds from it has changed since the last build:
 * content_state remembers a hash of all of those files.
 */

declare(strict_types=1);

/** What the catalog and the bank are built from. A change to any of these rebuilds them. */
const CONTENT_FILES = [
    'data/vocab.json',
    'data/kanji.json',
    'data/audio.json',
    'data/authored-items-part1.php',
    'data/authored-items-part2.php',
    'src/content.php',
    'src/generate.php',
    'src/conjugate.php',
    'src/speech.php',
    'src/srs/catalog.php',
    'src/util.php',
];

/** The content from data/, as the builders take it. */
function content_load(): array
{
    return [
        'vocab' => read_json(ROOT . '/data/vocab.json'),
        'kanji' => read_json(ROOT . '/data/kanji.json'),
        'audio' => speech_read_index(),
        'authored' => array_merge(require ROOT . '/data/authored-items-part1.php', require ROOT . '/data/authored-items-part2.php'),
    ];
}

function content_hash(): string
{
    $h = hash_init('sha256');
    foreach (CONTENT_FILES as $file) {
        $path = ROOT . '/' . $file;
        hash_update($h, $file . ' ' . (is_file($path) ? hash_file('sha256', $path) : 'missing') . "\n");
    }
    return hash_final($h);
}

/**
 * Rebuilds srs_items and exam_questions when the content changed (or always,
 * with $force). Returns what it built, or null when everything was current.
 */
function content_sync(bool $force = false): ?array
{
    $hash = content_hash();
    if (!$force && db_value('SELECT hash FROM content_state') === $hash) {
        return null;
    }

    $t = microtime(true);
    $content = content_load();
    $catalog = catalog_build($content);
    $bank = exam_build_bank($content);

    db_tx(static function () use ($catalog, $bank, $content, $hash): void {
        db_exec('DELETE FROM srs_items');
        db_exec(
            "INSERT INTO srs_items (id, ord, type, lesson, kanji, data)
             SELECT e->>'id', (e->>'order')::int, e->>'type', (e->>'lesson')::smallint, coalesce((e->'kanji')::jsonb, '[]'), e
             FROM json_array_elements(?::json) AS e",
            [json_text($catalog['items'])]
        );
        db_exec('DELETE FROM exam_questions');
        db_exec(
            "INSERT INTO exam_questions (seq, id, section, lesson, book, question, hint, reading, audio, correct, distractors, explain, ref)
             SELECT n - 1, e->>'id', e->>'section', (e->>'lesson')::smallint, (e->>'book')::smallint, e->>'question',
                    e->>'hint', e->>'reading', e->>'audio', e->>'correct', e->'distractors', e->>'explain', e->>'ref'
             FROM json_array_elements(?::json) WITH ORDINALITY AS t(e, n)",
            [json_text($bank)]
        );
        db_exec(
            'INSERT INTO content_state (id, hash, synced_at, lessons, audio_words, audio_voices) VALUES (1, ?, now(), ?::jsonb, ?, ?)
             ON CONFLICT (id) DO UPDATE SET hash = EXCLUDED.hash, synced_at = EXCLUDED.synced_at, lessons = EXCLUDED.lessons,
                audio_words = EXCLUDED.audio_words, audio_voices = EXCLUDED.audio_voices',
            [$hash, json_text($catalog['lessons']), count($content['audio']['clips']), count($content['audio']['voices'])]
        );
    });

    return ['items' => count($catalog['items']), 'questions' => count($bank), 'seconds' => round(microtime(true) - $t, 1)];
}

/** Is the content in the database the content in data/? */
function content_current(): bool
{
    return db_value('SELECT hash FROM content_state') === content_hash();
}
