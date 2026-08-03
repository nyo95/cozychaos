/**
 * Visual check: boots the real client against a real server in a headless
 * browser and photographs the match at phone and desktop sizes.
 *
 * The point is A-09. The arena canvas must render at exactly 2:3 on every
 * device, with the leftover space as letterbox — so this measures the canvas
 * box as rendered, not as authored, and fails loudly if the ratio drifts.
 *
 * Run: node .audit/shoot.mjs   (server + vite dev must already be listening)
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const OUT = 'tmp/shots';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'phone-430x932', width: 430, height: 932, mobile: true },
  { name: 'phone-390x844', width: 390, height: 844, mobile: true },
  { name: 'desktop-1280x720', width: 1280, height: 720, mobile: false },
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const results = [];

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
  });

  // Two seats, so the match actually starts instead of sitting in the lobby.
  const host = await context.newPage();
  const errors = [];
  host.on('pageerror', (error) => errors.push(String(error)));
  host.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await host.goto(BASE, { waitUntil: 'networkidle' });
  await host.fill('#player-name', 'Ana').catch(() => {});
  await host.waitForSelector('#create-room:not([disabled])', { timeout: 20000 });
  await host.click('#create-room');
  await host.waitForSelector('.match', { state: 'visible', timeout: 15000 });
  const code = (await host.textContent('#room-code'))?.trim() ?? '';

  const guest = await context.newPage();
  await guest.goto(BASE, { waitUntil: 'networkidle' });
  await guest.fill('#player-name', 'Bo').catch(() => {});
  await guest.fill('#room-input', code);
  await guest.waitForSelector('#join-room:not([disabled])', { timeout: 20000 });
  await guest.click('#join-room');
  await guest.waitForSelector('.match', { state: 'visible', timeout: 15000 });

  // Let a Turn actually begin so the HUD has live phase, timer, wind, Ink.
  await host.waitForTimeout(2500);

  const measured = await host.evaluate(() => {
    const canvas = document.querySelector('.match canvas');
    const rect = canvas.getBoundingClientRect();
    const root = getComputedStyle(document.documentElement);
    return {
      width: rect.width,
      height: rect.height,
      ratio: rect.width / rect.height,
      cssVar: root.getPropertyValue('--arena-aspect').trim(),
      phase: document.querySelector('#phase-label')?.textContent?.trim() ?? '',
      wind: document.querySelector('#wind-status')?.textContent?.trim() ?? '',
      ink: document.querySelector('#ink-label')?.textContent?.trim() ?? '',
      padVisible: !!document.querySelector('.move-pad'),
    };
  });

  await host.screenshot({ path: `${OUT}/${viewport.name}.png` });
  results.push({ viewport: viewport.name, ...measured, errors });
  await context.close();
}

await browser.close();

const TARGET = 2 / 3;
console.log('=== A-09: rendered arena ratio, measured not authored ===\n');
let failed = false;
for (const r of results) {
  const drift = Math.abs(r.ratio - TARGET);
  const ok = drift < 0.01;
  if (!ok) failed = true;
  console.log(
    `${r.viewport.padEnd(18)} canvas ${Math.round(r.width)}x${Math.round(r.height)}  ` +
      `ratio ${r.ratio.toFixed(4)}  target ${TARGET.toFixed(4)}  ${ok ? '✓' : `✗ drift ${drift.toFixed(4)}`}`,
  );
  console.log(`  --arena-aspect="${r.cssVar}"  phase="${r.phase}"  wind="${r.wind}"  ink="${r.ink}"`);
  if (r.errors.length > 0) {
    failed = true;
    console.log(`  page errors: ${r.errors.slice(0, 3).join(' | ')}`);
  }
}
console.log(`\nscreenshots in ${OUT}/`);
if (failed) process.exitCode = 1;
