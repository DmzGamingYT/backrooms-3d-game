import { useEffect, useRef, useState, type ReactElement } from "react";
import { useVoice } from "./hooks/useVoice";
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
import { BackendSwitcher } from "./components/controls/BackendSwitcher";

/**
 * Solis — root layout.
 *
 *   Aurora background   (z = -10)
 *   Header strip        (z =  20) — brand · mode · clock · theme · backend · status
 *   Two-column main     (z =  10)
 *     Hero              — voice (orb + mic) OR text (chat thread + input)
 *     Action aside      — Briefing · Tâches · Notes · Météo
 *
 * BackendSwitcher is the SINGLE source of truth for backend config +
 * Discord webhook + skill toggles. BackendCard is gone — the popover
 * hosts everything related to AI configuration.
 *
 * `useVoice` centralises: backend, tasks, memory, skills, voice state,
 * transcript + tool chips. The notify surface renders a small toast
 * in the upper-right so skill executions don't disappear silently.
 */
export default function App(): ReactElement {
  const voice = useVoice();
  const tasksRemaining = voice.tasks.tasks.filter((t) => !t.done).length;

  const statusMicrocopy = (() => {
    switch (voice.status) {
      case "idle":      return voice.mode === "voice" ? "Touchez l'orb ou le micro pour parler." : "Posez votre première question ci-dessous.";
      case "listening": return "Je vous écoute…";
      case "processing":return "Je réfléchis…";
      case "speaking":  return "Je lis ma réponse à voix haute.";
    }
  })();

  const isBusy = voice.status === "processing" || voice.status === "speaking";
  const [asideOpen, setAsideOpen] = useState(false);

  // Ref to the latest toggleVoice so the keyboard listener doesn't
  // re-subscribe on every render (toggleVoice is a fresh useCallback
  // each time because useAssistant returns a new object reference).
  const toggleVoiceRef = useRef(voice.toggleVoice);
  toggleVoiceRef.current = voice.toggleVoice;

  // Keyboard shortcuts (voice-first UX):
  //   Space  → toggle voice (only in voice mode, not while typing)
  //   Escape → stop listening / TTS / processing · close mobile aside
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space" && voice.mode === "voice") {
        e.preventDefault();
        toggleVoiceRef.current();
      } else if (e.key === "Escape") {
        if (voice.status !== "idle") toggleVoiceRef.current();
        setAsideOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [voice.mode, voice.status]);

  const asideContent = (
    <>
      <BriefingCard tasksRemaining={tasksRemaining} />
      <TasksPanel
        tasks={voice.tasks.tasks}
        onAdd={voice.tasks.add}
        onToggle={voice.tasks.toggle}
        onRemove={voice.tasks.remove}
        onEdit={voice.tasks.edit}
        onClearDone={voice.tasks.clearDone}
      />
      <NotesCard
        notes={voice.memory.notes}
        setNotes={voice.memory.setNotes}
        clear={voice.memory.clearNotes}
      />
      <WeatherCard />
    </>
  );

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
          themePref={voice.theme.pref}
          onThemeCycle={voice.theme.cycle}
          slotActions={
            <BackendSwitcher
              config={voice.backend.config}
              onPickKind={voice.backend.setKind}
              onPatch={voice.backend.patch}
              skillToggles={voice.skills.toggles}
              onSkillToggle={voice.skills.toggle}
              onResetSkills={voice.skills.reset}
            />
          }
        />

        <NotifyToast text={voice.notifyText} />

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

          {/* ───── Action aside — desktop (static right column) ── */}
          <aside className="hidden lg:flex flex-col gap-3 min-h-0 overflow-y-auto pr-1 thin-scroll pb-2">
            {asideContent}
          </aside>
        </main>

        {/* ───── Action aside — mobile (slide-in drawer) ─────── */}
        {asideOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex justify-end">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setAsideOpen(false)}
              aria-hidden
            />
            <aside role="dialog" aria-modal="true" aria-label="Panneau d'informations" className="relative w-80 max-w-[85vw] h-full glass-heavy overflow-y-auto p-4 thin-scroll flex flex-col gap-3">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setAsideOpen(false)}
                  aria-label="Fermer le panneau"
                  className="text-zinc-400 hover:text-zinc-200 text-sm transition"
                >
                  ✕
                </button>
              </div>
              {asideContent}
            </aside>
          </div>
        )}

        {/* ───── Floating aside toggle — mobile/tablet only ─── */}
        {!asideOpen && (
          <button
            type="button"
            onClick={() => setAsideOpen(true)}
            aria-label="Ouvrir le panneau"
            className="lg:hidden fixed bottom-6 right-6 z-30 glass-heavy rounded-full px-4 py-3 text-[10px] uppercase tracking-[0.3em] text-zinc-200 hover:scale-105 active:scale-95 transition shadow-lg"
          >
            Panneau
          </button>
        )}
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

function VoiceHero(p: VoiceHeroProps): ReactElement {
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

function TextHero(p: TextHeroProps): ReactElement {
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

// ────────────── Toast ───────────────────────────────────────────

function NotifyToast({ text }: { text: string | null }): ReactElement | null {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (text) { setVisible(true); }
    else { const id = window.setTimeout(() => setVisible(false), 240); return () => clearTimeout(id); }
  }, [text]);
  if (!visible || !text) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-20 right-6 z-40 glass rounded-xl px-3 py-2 text-[11px] text-zinc-200 leading-relaxed shadow-lg max-w-sm"
    >
      {text}
    </div>
  );
}
