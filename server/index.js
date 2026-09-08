import { createApp } from './app.js';
import { readFile } from 'node:fs/promises';

async function loadConfig() {
  const packageJsonUrl = new URL('../package.json', import.meta.url);
  const packageJson = JSON.parse(await readFile(packageJsonUrl, 'utf8'));
  return packageJson.config || {};
}

const config = await loadConfig();

// Env vars override package.json's config block when set (e.g. `PORT=3002
// npm start` for a second, disposable instance) — package.json's `config`
// is the everyday default, not the only way to run this.
const HOST = process.env.HOST || config.host || '127.0.0.1';
const PORT = process.env.PORT ? Number(process.env.PORT) : Number(config.port) || 3000;

createApp()
  .then((app) => {
    app.listen(PORT, HOST, () => {
      console.log(`Japanese N4 prep app running at http://${HOST}:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
