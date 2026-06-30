# Solis — Assistant vocal / Voice Assistant

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/hero-night.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/screenshots/hero-day.png">
    <img alt="Solis — assistant vocal français, glassmorphism + aurore animée" src="docs/screenshots/hero-night.png" width="100%">
  </picture>
</p>

<p align="center">
  <img alt="Démonstration du flow vocal Solis (écoute → traitement → réponse)" src="docs/screenshots/flow-demo.gif" width="640">
</p>

A minimalist voice-first AI assistant built with React + Vite + TypeScript. Glass interface over an animated aurora, real-time audio-reactive orb in the center, persistent conversation memory, and a unified runtime backend switcher for **Groq** (free tier), **OpenRouter Zen** (free models), and **Ollama** (local).

## Stack

- **React 19.2** + **TypeScript 5.9** strict + **Vite 7**
- **Tailwind 4** — utility CSS + design tokens in CSS variables
- **Web Speech API** — `SpeechRecognition` (STT) + `speechSynthesis` (TTS)
- **Web Audio API** + `AnalyserNode` for real-time orb reactivity
- **OpenAI-compatible `/v1/chat/completions`** — Groq, OpenRouter Zen, Ollama (≥0.5)
- **localStorage** persistence — transcript, tasks, notes, backend config
- `vite-plugin-singlefile` — single-file production bundle (trivial GH Pages deploy)

## Démarrer

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, allow the microphone, tap the orb or the mic pill. Solis transcribes what you say (fr-FR by default, picked from `navigator.language`) and replies out loud via TTS.

To enable a real LLM: click the **“Démo”** pill in the top-right header → pick Groq / OpenRouter Zen / Ollama → paste your key (or endpoint for local Ollama). The model field accepts an override; defaults match each provider's *free* tier.

## Backends LLM

| Backend        | Where it runs | Cost       | Auth                              | Notes                                       |
| -------------- | ------------- | ---------- | --------------------------------- | ------------------------------------------- |
| **Démo**       | local (echo)  | gratuit    | aucune                            | Default fallback; useful when offline       |
| **Groq**       | cloud         | tier gratuit | clé API `gsk_…`                  | Llama 3.x · Mixtral · Gemma                  |
| **OpenRouter Zen** | cloud       | tier gratuit | clé API `sk-or-…`               | Pool de modèles `…:free`                    |
| **Ollama**     | local         | gratuit    | endpoint (defaut `http://localhost:11434`) | Lance `ollama serve` côté machine           |

The provider abstraction (`LLMProvider`) and the SSE consumer (`openaiCompatibleStream`) live in `src/ai/providers/`. Switching backend at runtime is a single config flip — no UI tear-down, no re-mount — `AIManager` builds a new provider on the next token burst.

## Architecture

```
src/
├─ ai/
│  ├─ providers/        # groq · openrouter · ollama · mock — interface LLMProvider
│  ├─ openaiCompatible.ts # parseur SSE partagé (data: …\n\n)
│  ├─ manager.ts         # AIManager + SOLIS_SYSTEM_PROMPT
│  ├─ processText.ts     # stripMarkdown avant TTS
│  └─ speech/webSpeech.ts # SpeechRecognition + speechSynthesis wrappers
├─ components/
│  ├─ aurora/            # fond animé + grain SVG
│  ├─ glass/             # GlassPanel · GlassButton (default/soft/heavy)
│  ├─ voice/             # VoiceOrb (audio-réactif) · MicButton
│  ├─ chat/              # TranscriptPanel · ChatInput (mode texte)
│  ├─ cards/             # Briefing · Weather (stub) · Notes
│  ├─ panels/            # Tasks + TaskForm + TaskItem
│  ├─ controls/          # BackendSwitcher (glass pop-over)
│  └─ layout/            # Header (mode Voix/Texte · horloge · status)
├─ hooks/
│  ├─ useVoice.ts        # master conversation hook (status, mode, transcript, audio analyser)
│  ├─ useAssistant.ts    # run() — stream → bubble → TTS ; abort via runId bump
│  ├─ useBackend.ts      # BackendConfig + clé API + model override
│  ├─ useMemory.ts       # bloc-notes (scratchpad string)
│  └─ useTasks.ts        # liste de tâches CRUD + reorder
└─ utils/
   ├─ storage.ts         # loadJSON / saveJSON / uid (localeStorage thin-wrappers)
   ├─ time.ts            # fr-FR formatters (formats clock + date longue)
   └─ cn.ts              # clsx wrapper
```

## Design notes

- **Aurora** — quatre `radial-gradient` flous sur courbes de Lissajous, CSS pur (pas de canvas/WebGL pour le fond — préserve le GPU pour l'orb).
- **Grain** — `<feTurbulence>` SVG inline en `mix-blend-overlay` à 6 % ; pellicule analogique à coût zéro.
- **Glass** — `backdrop-filter: blur(28px) saturate(1.3)` + inset highlight + box-shadow. Trois variantes : `default`, `soft`, `heavy`.
- **VoiceOrb** — trois anneaux concentriques. L'anneau intérieur réagit au niveau micro via `AnalyserNode.getByteFrequencyData` lissé en EMA, poussé à 10 fps pour ne pas re-render React trop souvent.
- **Typo** — `Inter` pour l'UI, `Fraunces` pour les titres ; contraste graphique entre données et prose.

## Crédits

- Polices : Inter (OFL) et Fraunces (OFL) via Google Fonts.
- Aucun autre asset externe ; totale autonomie — animations 100 % CSS + SVG.
