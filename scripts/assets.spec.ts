import { test, expect, Page, BrowserContext } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import { webmToGif, ensureDir, fileSizeBytes } from './webmToGif';
import { SPEECH_MOCK_INIT_SCRIPT } from './devSpeechMock';

const BASE_URL = process.env.SOLIS_BASE_URL ?? 'http://localhost:4173';
const OUT_DIR = path.resolve('docs/screenshots');
const ASSETS_VERSION = '1.0.0';

/**
 * Clé localStorage effective de useTheme.ts dans Solis (vérifiée) : 'solis.theme.v1'.
 * On sticky-once l'override via addInitScript pour qu'il prime sur le
 * prefers-color-scheme auto.
 */
const THEME_STORAGE_KEY = 'solis.theme.v1';

test.beforeAll(async () => {
  await ensureDir(OUT_DIR);
  await fs.writeFile(
    path.join(OUT_DIR, '_version.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), version: ASSETS_VERSION }, null, 2),
  );
});

/** Force le thème via la clé RÉELLE de useTheme.ts. */
async function forceTheme(page: Page, theme: 'day' | 'night') {
  await page.emulateMedia({ colorScheme: theme === 'night' ? 'dark' : 'light' });
  await page.addInitScript(
    ({ key, value }: { key: string; value: string }) => {
      try { localStorage.setItem(key, value); } catch (_) {}
    },
    { key: THEME_STORAGE_KEY, value: theme },
  );
}

/**
 * Attends l'état de l'orb via son attribut data-orb-state (ajouté à VoiceOrb.tsx)
 * ou en fallback sur le sélecteur de classe Glass/VoiceOrb. Retourne true si
 * trouvé dans les 15s.
 */
async function waitForOrbState(page: Page, state: string): Promise<void> {
  const sel = `[data-orb-state="${state}"]`;
  await page.waitForSelector(sel, { timeout: 15_000, state: 'attached' });
}

/** Configure une page avec permissions micro + mock Speech Recognition. */
async function configureSpeechPage(
  context: BrowserContext,
  theme: 'day' | 'night' = 'night',
): Promise<Page> {
  // URL d'origine des permissions: utiliser pattern permissif pour preview localhost
  await context.grantPermissions(['microphone']);
  const page = await context.newPage();
  page.addInitScript(SPEECH_MOCK_INIT_SCRIPT);
  await forceTheme(page, theme);
  return page;
}

/* ─────────────────────  HERO PNGs  ───────────────────── */

test.describe('Hero screenshots', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

  test('Hero — Day', async ({ page }) => {
    await forceTheme(page, 'day');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await waitForOrbState(page, 'idle');
    await page.waitForTimeout(1200); // settle aurore
    await page.screenshot({ path: path.join(OUT_DIR, 'hero-day.png'), type: 'png' });
  });

  test('Hero — Night', async ({ page }) => {
    await forceTheme(page, 'night');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await waitForOrbState(page, 'idle');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT_DIR, 'hero-night.png'), type: 'png' });
  });
});

/* ─────────────────────  SOCIAL PREVIEWS  ───────────────────── */

test.describe('GitHub social preview (1280×640)', () => {
  test.use({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 2 });

  test('Social — Day', async ({ page }) => {
    await forceTheme(page, 'day');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await waitForOrbState(page, 'idle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, 'social-day.png'), type: 'png' });
  });

  test('Social — Night', async ({ page }) => {
    await forceTheme(page, 'night');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await waitForOrbState(page, 'idle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, 'social-night.png'), type: 'png' });
  });
});

/* ─────────────────────  FLOW GIF  ───────────────────── */

test('Vocal flow GIF (night, orb listening → responding → idle)', async ({ context }) => {
  const page = await configureSpeechPage(context, 'night');
  await page.setViewportSize({ width: 800, height: 600 });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await waitForOrbState(page, 'idle');

  const video = page.video();
  if (!video) throw new Error('playwright config: enable video on context.use().');

  // Pilote le flow via le mock SpeechRecognition (zéro code app requis)
  await page.evaluate(async () => {
    const ctrl = (window as any).__mockSpeechController;
    if (!ctrl) throw new Error('Mock Speech non injecté');

    // 1) Idle → Listening (orb pulse)
    ctrl.start();
    await new Promise((r) => setTimeout(r, 700));

    // 2) Injecte un transcript → processing + chip de skill
    ctrl.deliverResult('Éteins les lumières du salon');
    await new Promise((r) => setTimeout(r, 1500));

    // 3) Fin de reconnaissance → réponse + retour idle
    ctrl.end();
    await new Promise((r) => setTimeout(r, 900));
  });

  await waitForOrbState(page, 'idle');

  // Playwright finalizes the WebM only after page.close() — read after close
  await context.close();
  const webmPath = await video.path();
  const gifPath = path.join(OUT_DIR, 'flow-demo.gif');

  await webmToGif(webmPath, gifPath, {
    fps: 12,
    width: 640,
    height: 480,
    paletteStatsMode: 'diff',
    dither: 'sierra2_4a',
    loop: true,
  });

  // Garde-fous : taille ≤ 5 MB
  const size = await fileSizeBytes(gifPath);
  expect(size, 'GIF trop volumineux').toBeLessThan(5 * 1024 * 1024);
});

/* ─────────────────────  REPORTING  ───────────────────── */

test.afterAll(async () => {
  const files = await fs.readdir(OUT_DIR).catch(() => []);
  const summary = await Promise.all(
    files
      .filter((f) => /\.(png|gif)$/.test(f))
      .map(async (f) => {
        const stat = await fs.stat(path.join(OUT_DIR, f));
        return `${f.padEnd(28)} ${(stat.size / 1024).toFixed(1).padStart(8)} KB`;
      }),
  );
  // eslint-disable-next-line no-console
  console.log('\n[Solis assets] Générés:\n' + summary.map((l) => '  ' + l).join('\n'));
});
