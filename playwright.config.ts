import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — utilisée UNIQUEMENT par le script de génération
 * d'assets (scripts/assets.spec.ts). Ne s'exécute pas dans la CI "vitest"
 * car le dédoublonnage passe par le nom du fichier de test.
 *
 * - video: 'on' → la vidéo WebM est conservée pour CHAQUE test, on l'utilise
 *   comme source pour générer le GIF du flow vocal.
 * - retries: 0   → pas de flaky retry sur des captures déterministes.
 */
export default defineConfig({
  testDir: './scripts',
  testMatch: /assets\.spec\.ts$/,
  fullyParallel: false, // séquentiel : on contrôle le thème via localStorage
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.SOLIS_BASE_URL ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
    video: 'on',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
