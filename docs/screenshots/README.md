# 📸 Visual assets — Solis

Captures et animations auto-générées utilisées dans le README et la GitHub social preview.

## Fichiers

| Fichier | Dimensions | Format | Utilisation |
|---------|-----------:|--------|-------------|
| `hero-day.png`        | 2880×1800 (2×) | PNG (lossless) | Hero du README, mode jour |
| `hero-night.png`      | 2880×1800 (2×) | PNG (lossless) | Hero du README, mode nuit |
| `social-day.png`      | 2560×1280 (2×) | PNG             | Social preview GitHub — jour |
| `social-night.png`    | 2560×1280 (2×) | PNG             | Social preview GitHub — nuit |
| `flow-demo.gif`       | 800×600 | GIF (≤ 5 MB, 15 fps, loop ∞) | Démo du flow vocal |

## Régénération locale

Pré-requis : Node 20+, `npm ci`.

```bash
npm ci
npx playwright install --with-deps chromium
npm run build
npm run preview -- --port 4173 &
npm run assets:generate
```

Avec headed mode (debug) :

```bash
npm run assets:generate:headed
```

## Régénération automatique (CI)

Le workflow [`.github/workflows/assets.yml`](../../.github/workflows/assets.yml) tourne sur chaque push vers `main`
et commit les nouveaux assets avec le tag **`[skip ci]`** dans le message pour éviter une boucle infinie.

## Architecture

1. **`scripts/assets.spec.ts`** — script Playwright qui pilote l'app :
   - injecte le mock Speech Recognition (`scripts/devSpeechMock.ts`) via `addInitScript`,
   - force le thème via `localStorage` + `emulateMedia({ colorScheme })`,
   - attend l'état de l'orb via `[data-orb-state="..."]`,
   - enregistre la vidéo WebM avec `page.video()`,
2. **`scripts/webmToGif.ts`** — wrapper `fluent-ffmpeg` + `ffmpeg-static` qui
   convertit la WebM en GIF via la technique **_palettegen + paletteuse_** pour
   limiter le banding sur les dégradés d'aurore,
3. **`scripts/devSpeechMock.ts`** — faux `window.SpeechRecognition` qui expose
   `window.__mockSpeechController.{start, deliverResult, end}` aux scripts de test.
   Zéro dépendance sur le code de l'app.

## Garde-fous

- Le GIF final est vérifié ≤ 5 MB avant commit.
- Les paths-ignore dans le workflow empêchent la boucle auto-déclenchée.
- Le retry est désactivé : les échecs sont des bugs à corriger, pas du flakiness à masquer.

## Debug

Si une capture sort cassée :

```bash
SOLIS_BASE_URL=http://localhost:4173 \
  npx playwright test scripts/assets.spec.ts --headed --debug
```
