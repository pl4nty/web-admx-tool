import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = (process.env.BASE_URL || 'http://localhost:4321').replace(/\/$/, '');
const outDir = process.env.SHOT_DIR || 'screenshots';
mkdirSync(outDir, { recursive: true });

// Pages that exercise the layout, category tree and search UI.
const targets = [
  { name: 'home', path: '/en-us/' },
  { name: 'search', path: '/en-us/search/' },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  for (const t of targets) {
    const url = base + t.path;
    console.log(`capturing ${t.name} -> ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
    // Give client-side hydration (tree/search) a moment to settle.
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: `${outDir}/${t.name}.png`, fullPage: false });
  }
} finally {
  await browser.close();
}
console.log('done');
