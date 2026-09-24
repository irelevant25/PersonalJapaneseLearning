// The owner's requirement: nothing in the repository names the course the data
// was transcribed from. The name is spelt with character codes here, so this
// file doesn't contain it either. Checked: every file git would publish (so
// books/ and the rest of .gitignore are left out), except the owner's study
// history in progress/, results/ and reports/, which tests never read; the code
// that writes it is checked here. Commit messages are not files: keep them
// clean by hand.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const NAME = new RegExp(String.fromCharCode(103, 101, 110, 107, 105), 'i');
const OWNER_DATA = /^(progress|results|reports)\//;
const BINARY = /\.(png|jpe?g|gif|mp3|pdf|ico|woff2?)$/i;

/** Tracked files and new files that .gitignore lets through; null outside a git checkout. */
function published() {
  try {
    const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8' });
    return [...new Set(out.split('\0').filter(Boolean))];
  } catch {
    return null;
  }
}

test('no file, and no file name, names the source of the data', (t) => {
  const files = published();
  if (!files) return t.skip('not a git checkout');
  const found = [];
  let checked = 0;
  for (const rel of files) {
    if (OWNER_DATA.test(rel)) continue;
    if (NAME.test(rel)) found.push(`${rel} (file name)`);
    if (BINARY.test(rel)) continue;
    let text;
    try {
      text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') continue; // deleted but not yet committed
      throw e;
    }
    checked += 1;
    text.split('\n').forEach((line, i) => NAME.test(line) && found.push(`${rel}:${i + 1}`));
  }
  assert.ok(checked > 50, `${checked} files checked`);
  assert.deepEqual(found, []);
});
