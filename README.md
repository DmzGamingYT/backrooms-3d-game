# Backrooms 3D Game

Mini-jeu d'horreur 3D inspiré du lore **Backrooms** (Level 0 / Level 1), développé en React + TypeScript + Three.js, bundlé avec Vite.

## Aperçu

- Labyrinthe procédural de couloirs jaunes avec papier-peint moisi
- Brouillard volumétrique, éclairage industriel ondulant, post-FX cinéma (bloom + vignette + grain)
- Un **stalker** qui te traque par pathfinding BFS
- Système d'items : **eau d'amande** (régénère le sanity) et **piles** (rechargent la lampe torche)
- Lampe torche à batterie limitée — refuse de s'allumer si les piles sont à zéro
- HUD avec barres (Sanity / Stamina), minimap pivotée autour du joueur, compteur d'items, indicateur d'orientation du monstre
- Écran de fin de partie avec stats (temps, distance, % exploré, items trouvés, near-misses)
- 3 variantes procédurales de papier-peint (défaut / eau / béton) + décorations (escalier descendant, affiches)

## Stack

- **React 19** + **TypeScript 5.9**
- **Three.js 0.185** (rendu WebGL)
- **Vite 7** (dev server + bundler, sortie **single-file HTML**)
- **Tailwind 4** (HUD overlay)
- Audio 100 % procédural via `AudioContext` — pas de fichiers son à charger

## Démarrer

```bash
npm install
npm run dev
```

Ouvre `http://localhost:5173` — la cinématique Level 1 démarre, clique pour entrer dans le labyrinthe.

## Build de production

```bash
npm run build
```

`dist/index.html` est généré en un seul fichier autonome grâce à `vite-plugin-singlefile` (utilisable via `file://`).

## Contrôles

| Touche | Effet |
|--------|-------|
| `↑ ↓ ← →` / `WASD` | Se déplacer |
| Souris | Regarder autour |
| `Clic gauche` (intro) | Démarrer |
| `F` | Allumer / éteindre la lampe torche |
| `Maj.` (maintenir) | Sprint (consomme la stamina) |
| `Échap` | Pause |
| `R` (HUD pause) | Restart |

## Difficultés

| Mode | Stalker | Lampe (par pile) |
|------|---------|------------------|
| **Casual** | Lent, spawn tardif | 40 s |
| **Standard** | Normal | 25 s |
| **Hardcore** | Agressif, spawn rapide | 15 s |

## Architecture

```
src/
├─ App.tsx              Root React + HUD + écrans menu/pause/fin
├─ main.tsx             Point d'entrée Vite
├─ index.css            Tailwind + resets
├─ utils/cn.ts          Helper classnames
└─ game/
   ├─ BackroomsGame.ts  Chef d'orchestre : update / draw / events
   ├─ world.ts          InstancedMesh des murs + sol + plafond + décorations
   ├─ maze.ts           Génération du labyrinthe + spawns
   ├─ player.ts         Déplacements + stamina + flashlightBatTimer
   ├─ monster.ts        IA stalker (BFS pathfinding)
   ├─ items.ts          Eau d'amande + piles + raycasts de pickup
   ├─ lighting.ts       Lumières scène + flashlight
   ├─ postfx.ts         Bloom + grain + vignette
   ├─ audio.ts          Sons procéduraux (pickup, flashlight, pas…)
   ├─ textures.ts       3 variantes de papier-peint procédurales
   ├─ dust.ts           Particules de poussière en l'air
   ├─ intro.ts          Cinématique d'intro (Level 1 image)
   ├─ grid.ts           Helpers de grille
   ├─ tuning.ts         Tuning par difficulté
   └─ types.ts          Types partagés (HudState, RunStats, GameCallbacks)
```

## Crédits

- Photos `BEDROOM-*.png` : images de référence Level 1 (utilisées uniquement par la cinématique d'intro)
- Textures de murs / sol / plafond / eau : 100 % procédurales (canvas 2D, zéro asset externe)
- Aucun asset 3D téléchargé — toute la géométrie est générée en code

## License

Projet personnel, libre d'utilisation. Aucune dépendance propriétaire.
