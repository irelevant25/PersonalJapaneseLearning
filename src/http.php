<?php
/**
 * Requests and responses under PHP's built-in web server.
 */

declare(strict_types=1);

/** An error with the HTTP status to answer it with. */
final class HttpError extends RuntimeException
{
    public int $status;

    public function __construct(int $status, string $message)
    {
        parent::__construct($message);
        $this->status = $status;
    }
}

/**
 * The request's JSON body as an array; [] when there is none. As before,
 * only a JSON object or array is a body: anything else is a 400.
 */
function http_body(): array
{
    static $body = null;
    if ($body !== null) {
        return $body;
    }
    $raw = (string) file_get_contents('php://input');
    $type = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? ''));
    if (!preg_match('~^application/([a-z0-9.+-]*\+)?json~', $type) || trim($raw) === '') {
        return $body = [];
    }
    try {
        $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        throw new HttpError(400, 'The request body is not valid JSON.');
    }
    if (!is_array($data)) {
        throw new HttpError(400, 'The request body must be a JSON object.');
    }
    return $body = $data;
}

/** A JSON response. $data may already be JSON text. */
function http_json(int $status, $data, array $headers = []): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    foreach ($headers as $h) {
        header($h);
    }
    echo is_string($data) ? $data : json_text($data);
}

/** An HTML (or other text) response. */
function http_text(int $status, string $body, string $type = 'text/html; charset=utf-8'): void
{
    http_response_code($status);
    header("Content-Type: $type");
    echo $body;
}

/** A file, with byte ranges (browsers ask for audio in ranges: 206 is the normal answer). */
function http_file(string $file, string $type, array $headers = []): void
{
    $size = (int) filesize($file);
    $start = 0;
    $end = $size - 1;
    $status = 200;
    if (preg_match('/^bytes=(\d*)-(\d*)$/D', trim((string) ($_SERVER['HTTP_RANGE'] ?? '')), $m) && ($m[1] !== '' || $m[2] !== '')) {
        if ($m[1] === '') {
            $start = max(0, $size - (int) $m[2]);
        } else {
            $start = (int) $m[1];
            if ($m[2] !== '') {
                $end = min($end, (int) $m[2]);
            }
        }
        if ($start > $end) {
            http_response_code(416);
            header("Content-Range: bytes */$size");
            return;
        }
        $status = 206;
        header("Content-Range: bytes $start-$end/$size");
    }
    http_response_code($status);
    header("Content-Type: $type");
    header('Accept-Ranges: bytes');
    header('Content-Length: ' . ($end - $start + 1));
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', (int) filemtime($file)) . ' GMT');
    foreach ($headers as $h) {
        header($h);
    }
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') {
        return;
    }
    $fh = fopen($file, 'rb');
    fseek($fh, $start);
    echo fread($fh, $end - $start + 1);
    fclose($fh);
}
