// Generic atomic JSON file read/write. This project's entire "database" is a
// handful of JSON files, so every write goes through here: write to a temp
// file, then rename over the target (atomic on the same filesystem), so a
// crash mid-write never corrupts progress.json. Writes to the same path are
// also serialized through a per-path promise chain to avoid interleaving.

import { promises as fs } from 'fs';
import path from 'path';

const writeQueues = new Map();

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
  const prev = writeQueues.get(filePath) || Promise.resolve();
  const next = prev
    .then(() => atomicWrite(filePath, data))
    .catch((err) => {
      console.error(`Failed writing ${filePath}:`, err);
      throw err;
    });
  writeQueues.set(filePath, next);
  return next;
}

async function atomicWrite(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}
