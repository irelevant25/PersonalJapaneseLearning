// Generic atomic JSON file read/write. This project's entire "database" is a
// handful of JSON files, so every write goes through here: write to a temp
// file, then rename over the target (atomic on the same filesystem), so a
// crash mid-write never corrupts progress.json. Writes to the same path are
// also serialized through a per-path promise chain to avoid interleaving.

import { promises as fs } from 'fs';
import path from 'path';

const writeQueues = new Map();

// On Windows a rename can fail for a moment while another program (antivirus,
// git, an editor) has the target open — retry a few times before giving up.
const RENAME_RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RENAME_RETRIES = 5;
const RENAME_RETRY_DELAY_MS = 60;

export async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw err;
  }
}

export function writeJson(filePath, data) {
  return writeText(filePath, () => JSON.stringify(data, null, 2));
}

// `text` is a string, or a function returning one — called when the write
// actually runs, so a queued write always saves the newest state.
export function writeText(filePath, text) {
  const prev = writeQueues.get(filePath) || Promise.resolve();
  // A failed write must not block the ones after it, so the chain continues
  // from a settled promise; the caller of the failed write still gets the error.
  const next = prev
    .catch(() => {})
    .then(() => atomicWrite(filePath, typeof text === 'function' ? text() : text))
    .catch((err) => {
      console.error(`Failed writing ${filePath}:`, err);
      throw err;
    });
  writeQueues.set(filePath, next);
  return next;
}

async function atomicWrite(filePath, text) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmpPath, text, 'utf8');
  try {
    await renameWithRetry(tmpPath, filePath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    throw err;
  }
}

async function renameWithRetry(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      if (attempt >= RENAME_RETRIES || !RENAME_RETRY_CODES.has(err.code)) throw err;
      await new Promise((resolve) => setTimeout(resolve, RENAME_RETRY_DELAY_MS * (attempt + 1)));
    }
  }
}
