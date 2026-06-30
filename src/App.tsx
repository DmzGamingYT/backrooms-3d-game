import { useVoice } from "./hooks/useVoice";
import { useTasks } from "./hooks/useTasks";
import { Aurora } from "./components/aurora/Aurora";
import { GlassPanel } from "./components/glass/Glass";
import { VoiceOrb } from "./components/voice/VoiceOrb";
import { MicButton } from "./components/voice/MicButton";
import { TranscriptPanel } from "./components/chat/TranscriptPanel";
import { ChatInput } from "./components/chat/ChatInput";
import { Header } from "./components/layout/Header";
import { BriefingCard } from "./components/cards/BriefingCard";
import { WeatherCard } from "./components/cards/WeatherCard";
import { NotesCard } from "./components/cards/NotesCard";
import { TasksPanel } from "./components/panels/TasksPanel";

/**
 * Solis — root layout.
 *
 *   Aurora background   (z = -10)
 *   Header strip        (z =  20) — brand, mode toggle, clock, backend, status
 *   Two-column main     (z =  10)
 *     Hero              — voice (orb + mic) OR text (chat thread + input)
 *     Action aside      — Briefing, Tasks, Notes, Weather
 *
 * The voice orb uses `voice.level` (mic analyser, averaged in 30 fps
 * bursts) as its inner-ring scale, so reactivity IS real audio — not a
 * canned animation.
 */
export default function App() {
  const voice = useVoice();
  // Single source of truth for tasks — passed down so BriefingCard's
  // remaining-counter never desyncs from what TasksPanel actually shows.
  const tasksState = useTasks();
  const tasksRemaining = tasksState.tasks.filter((t) => !t.done).length;

  const statusMicrocopy = (() => {
    switch (voice.status) {
      case "idle":
        return voice.mode === "voice"
          ? "Touchez l'orb ou le micro pour parler."
          : "Posez votre première question ci-dessous.";
      case "listening":  return "Je vous écoute…";
      case "processing": return "Je réfléchis…";
      case "speaking":   return "Je lis ma réponse à voix haute.";
    }
  })();

  const isBusy = voice.status === "processing" || voice.status === "speaking";

  return (
    <div className="relative min-h-screen w-screen overflow-hidden">
      <Aurora />

      <div className="relative z-10 flex flex-col h-screen">
        <Header
          status={voice.status}
          mode={voice.mode}
          onModeChange={voice.setMode}
          backendConfig={voice.backend.config}
          onBackendKind={voice.backend.setKind}
          onBackendPatch={voice.backend.patch}
        />

        <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 px-6 pb-6 pt-2 min-h-0">
          {/* ───── Hero ─────────────────────────────────────── */}
          <section className="flex flex-col min-h-0 max-w-3xl mx-auto w-full">
            {voice.mode === "voice" ? (
              <VoiceHero
                statusMicrocopy={statusMicrocopy}
                voiceStatus={voice.status}
                level={voice.level}
                onToggle={voice.toggleVoice}
                error={voice.error}
                transcript={voice.transcript}
                interim={voice.interim}
                onClear={voice.clear}
              />
            ) : (
              <TextHero
                statusMicrocopy={statusMicrocopy}
                voiceStatus={voice.status}
                transcript={voice.transcript}
                interim={voice.interim}
                sending={isBusy}
                error={voice.error}
                onSend={voice.sendMessage}
                onClear={voice.clear}
              />
            )}
          </section>

          {/* ───── Action aside ────────────────────────────── */}
          <aside className="hidden lg:flex flex-col gap-3 min-h-0 overflow-y-auto pr-1 thin-scroll pb-2">
            <BriefingCard tasksRemaining={tasksRemaining} />
            <TasksPanel
              tasks={tasksState.tasks}
              onAdd={tasksState.add}
              onToggle={tasksState.toggle}
              onRemove={tasksState.remove}
              onEdit={tasksState.edit}
              onClearDone={tasksState.clearDone}
            />
            <NotesCard />
            <WeatherCard />
          </aside>
        </main>
      </div>
    </div>
  );
}

// ────────────── Hero variants ───────────────────────────────────

interface VoiceHeroProps {
  statusMicrocopy: string;
  voiceStatus: import("./ai/types").VoiceStatus;
  level: number;
  onToggle: () => void;
  error: string | null;
  transcript: import("./ai/types").TranscriptEntry[];
  interim: string;
  onClear: () => void;
}

function VoiceHero(p: VoiceHeroProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 gap-6 py-6">
      <div className="flex-1 flex flex-col items-center justify-center select-none">
        <div className="text-center mb-12">
          <p className="text-[10px] uppercase tracking-[0.5em] text-zinc-500">Compagnon vocal</p>
          <h1 className="font-display text-4xl sm:text-5xl font-extralight text-zinc-100 mt-3 leading-tight">
            Comment puis-je
            <br />
            <span className="italic text-zinc-300">vous aider&nbsp;?</span>
          </h1>
        </div>

        <VoiceOrb status={p.voiceStatus} level={p.level} onClick={p.onToggle} />

        <div className="mt-10 flex flex-col items-center gap-3">
          <MicButton status={p.voiceStatus} onClick={p.onToggle} />
          <p className="text-xs text-zinc-400 max-w-sm text-center mt-2 leading-relaxed">
            {p.statusMicrocopy}
          </p>
          {p.error && (
            <p className="text-[11px] text-rose-300/90 max-w-sm text-center mt-1">{p.error}</p>
          )}
        </div>
      </div>

      {/* Slim transcript strip — only when there are messages */}
      {p.transcript.length > 0 && (
        <GlassPanel variant="soft" className="max-h-44 flex flex-col overflow-hidden p-4">
          <TranscriptPanel
            transcript={p.transcript.slice(-6)}
            interim={p.interim}
            onClear={p.onClear}
          />
        </GlassPanel>
      )}
    </div>
  );
}

interface TextHeroProps {
  statusMicrocopy: string;
  voiceStatus: import("./ai/types").VoiceStatus;
  transcript: import("./ai/types").TranscriptEntry[];
  interim: string;
  sending: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onClear: () => void;
}

function TextHero(p: TextHeroProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 gap-4 py-6">
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-[0.5em] text-zinc-500">Mode texte</p>
        <h1 className="font-display text-3xl font-extralight text-zinc-100 mt-3 leading-tight">
          Une question&nbsp;?
        </h1>
      </div>

      <GlassPanel className="flex-1 flex flex-col overflow-hidden p-6 min-h-0">
        <TranscriptPanel
          transcript={p.transcript}
          interim={p.interim}
          onClear={p.transcript.length > 0 ? p.onClear : undefined}
        />
      </GlassPanel>

      <ChatInput onSend={p.onSend} busy={p.sending} />

      {p.error && (
        <p className="text-[11px] text-rose-300/90 px-1">{p.error}</p>
      )}
    </div>
  );
}
