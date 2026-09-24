/**
 * Browser helpers: finds an installed Chromium browser (Edge on this machine)
 * and drives it with playwright-core — no browser download needed.
 * Override with BROWSER_PATH=<path to msedge.exe / chrome.exe>.
 */
const fs = require('fs');
const path = require('path');

const CANDIDATES = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

function findBrowser() {
  return CANDIDATES.find((p) => fs.existsSync(p)) || null;
}

async function launch() {
  const executablePath = findBrowser();
  if (!executablePath) {
    throw new Error(`No Edge/Chrome found. Set BROWSER_PATH. Looked in:\n  ${CANDIDATES.join('\n  ')}`);
  }
  const { chromium } = require('playwright-core');
  return chromium.launch({ executablePath, headless: true });
}

/** Collects page errors and failed requests so a run can assert "no errors". */
function watch(page, { ignore = [] } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    const url = r.url();
    if (r.status() >= 400 && !ignore.some((re) => re.test(url))) errors.push(`${r.status()} ${url}`);
  });
  return errors;
}

/** Tiny reporter for scripts that aren't node:test. */
function reporter() {
  let fails = 0;
  const ck = (name, cond, extra = '') => {
    console.log(`${cond ? '  ok  ' : '  FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
    if (!cond) fails += 1;
  };
  return { ck, fails: () => fails };
}

const SHOTS = path.join(__dirname, 'shots');

module.exports = { launch, watch, reporter, findBrowser, SHOTS };
