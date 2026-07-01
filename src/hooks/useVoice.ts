import { useCallback, useEffect, useRef, useState } from "react";
import {
  isSTTSupported,
  startStt,
  stopSpeaking,
  stopStt,
} from "../ai/speech/webSpeech";
import type { ChatMode, TranscriptEntry, VoiceStatus } from "../ai/types";
import { AIManager } from "../ai/manager";
import { useBackend } from "./useBackend";
import { useAssistant } from "./useAssistant";
import { useMemory } from "./useMemory";
import { useSkills } from "./useSkills";
import { useTasks } from "./useTasks";
import { useTheme } from "./useTheme";
import { loadJSON, saveJSON } from "../utils/storage";

const TRANSCRIPT_KEY = "solis.transcript.v1";
const MODE_KEY = "solis.mode.v1";

/**
 * Unified conversation hook — owns transcript, voice state machine,
 * audio-reactivity level for the orb, and exposes both `toggleVoice`
 * (mic round-trip) and `sendMessage` (text round-trip). Both paths
 * reach the same `useAssistant.run(...)` so backend behaviour is
 * identical.
 *
 * Skill wiring: ref-builds a SkillContext whenever tasks/notes/facts
 * change so skill.execute(...) always sees fresh app state.
 */
export function useVoice() {
  const backend = useBackend();
  const tasksState = useTasks();
  const memory = useMemory();
  const skills = useSkills();
  const theme = useTheme();

  // Generic UI toast surfaced through `notify()`. Kept internal so the
  // outside doesn't need to plumb a toast provider for V1.
  const [notifyText, setNotifyText] = useState<string | null>(null);
  const notifyTimer = useRef<number | null>(null);
  const notify = useCallback((msg: string) => {
    setNotifyText(msg);
    if (notifyTimer.current) window.clearTimeout(notifyTimer.current);
    notifyTimer.current = window.setTimeout(() => setNotifyText(null), 2400);
  }, []);

  // Lazy-init the AIManager on first render so the constructor never
  // sees a stale defaultConfig sneak through the spread.
  const managerRef = useRef<AIManager | null>(null);
  if (managerRef.current === null) {
    managerRef.current = new AIManager(backend.config);
  }
  useEffect(() => {
    managerRef.current?.setConfig(backend.config);
  }, [backend.config]);

  const configRef = useRef(backend.config);
  useEffect(() => { configRef.current = backend.config; }, [backend.config]);

  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>(() =>
    loadJSON<TranscriptEntry[]>(TRANSCRIPT_KEY, []),
  );
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(MODE_KEY) === "text"
        ? "text"
        : "voice";
    } catch {
      return "voice";
    }
  });

  // Mutable mirror of transcript — share with useAssistant without
  // re-creating it on every entry.
  const transcriptRef = useRef(transcript);
  useEffect(() => {
    transcriptRef.current = transcript;
    saveJSON(TRANSCRIPT_KEY, transcript);
  }, [transcript]);

  useEffect(() => {
    try { if (typeof window !== "undefined") window.localStorage.setItem(MODE_KEY, mode); }
    catch { /* private mode */ }
  }, [mode]);

  // Live SkillContext builder — memoised on every changing input so
  // skill.execute() always sees the current app state without us
  // building an outdated snapshot.
  const buildCtx = useCallback(() => skills.buildCtx({
    tasks: tasksState.tasks,
    addTask: tasksState.add,
    removeTask: tasksState.remove,
    toggleTask: tasksState.toggle,
    clearDoneTasks: tasksState.clearDone,
    notes: memory.notes,
    setNotes: memory.setNotes,
    facts: memory.facts,
    rememberFact: memory.rememberFact,
    forgetFact: memory.forgetFact,
    transcript: transcriptRef.current,
    discordWebhookUrl: backend.config.discordWebhookUrl,
    pickFiles: pickFilesViaInput,
    readFile: readTextFile,
    saveBlob: saveBlobViaAnchor,
    openMailto: (to, subject, body) => {
      const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(url, "_self");
    },
    notify,
  }), [skills, tasksState, memory, backend.config.discordWebhookUrl, notify]);

  const assistant = useAssistant({
    managerRef,
    transcriptRef,
    setTranscript,
    onError: (msg) => { setError(msg); setStatus("idle"); },
    onSpeaking: () => setStatus("speaking"),
    onIdle: () => setStatus("idle"),
    effectiveSkills: skills.effectiveSkills,
    buildCtx,
    configRef,
  });

  // ───── Audio analyser loop, only while we're actively listening. ────
  useEffect(() => {
    if (status !== "listening") return;
    let cancelled = false;
    const refs = {
      stream: null as MediaStream | null,
      ctx: null as AudioContext | null,
      analyser: null as AnalyserNode | null,
      raf: 0,
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        refs.stream = stream;

        const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
        const ctx = new AC();
        if (ctx.state === "suspended") {
          try { await ctx.resume(); } catch { /* gesture may be required */ }
        }
        refs.ctx = ctx;

        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        refs.analyser = analyser;

        const buf = new Uint8Array(analyser.frequencyBinCount);
        let lastUi = 0;
        let lastLevel = 0;
        const tick = () => {
          if (cancelled || !refs.analyser) return;
          refs.analyser.getByteFrequencyData(buf);
          const len = Math.min(48, buf.length);
          let sum = 0;
          for (let i = 0; i < len; i++) sum += buf[i];
          const v = sum / (len * 255);
          const now = performance.now();
          if (now - lastUi > 33) {
            lastLevel = lastLevel * 0.82 + v * 0.18;
            setLevel(lastLevel);
            lastUi = now;
          }
          refs.raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        setError((e as Error)?.message ?? "Micro indisponible");
        setStatus("idle");
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(refs.raf);
      refs.stream?.getTracks().forEach((t) => t.stop());
      try { refs.analyser?.disconnect(); } catch { /* noop */ }
      try { refs.ctx?.close(); } catch { /* noop */ }
      setLevel(0);
    };
  }, [status]);

  // ───── Round-trip handlers ────────────────────────────────────────

  const toggleVoice = useCallback(() => {
    setError(null);

    if (status === "idle") {
      if (!isSTTSupported()) {
        setError("Reconnaissance vocale indisponible dans ce navigateur. Essayez Chrome ou Edge.");
        return;
      }
      assistant.abort();
      setInterim("");
      const ok = startStt({
        onInterim: (t) => setInterim(t),
        onFinal: () => { /* see stopStt path */ },
        onError: (e) => {
          setError(e.message);
          setStatus("idle");
          setInterim("");
        },
        onEnd: () => setInterim(""),
      });
      if (ok) setStatus("listening");
      return;
    } else if (status === "listening") {
      stopStt().then((finalText) => {
        setInterim("");
        const trimmed = finalText.trim();
        if (!trimmed) { setStatus("idle"); return; }
        setStatus("processing");
        assistant.run(trimmed);
      });
      return;
    } else if (status === "speaking") {
      stopSpeaking();
      assistant.abort();
      setStatus("idle");
    } else if (status === "processing") {
      assistant.abort();
      setStatus("idle");
    }
  }, [status, assistant]);

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setError(null);
    setStatus("processing");
    assistant.run(trimmed);
  }, [assistant]);

  const clear = useCallback(() => {
    setTranscript([]);
    setInterim("");
    setError(null);
    assistant.abort();
  }, [assistant]);

  return {
    status,
    transcript,
    interim,
    level,
    error,
    mode,
    setMode,
    toggleVoice,
    sendMessage,
    clear,
    backend,
    tasks: tasksState,
    memory,
    skills,
    theme,
    notifyText,
  };
}

/* ───── file IO helpers used as the file-system skill surface ───── */

/** Open an OS file picker. Browsers don't fire `oncancel` reliably on
 *  `<input type="file">`, so we listen for the dialog focus hand-back
 *  (window receives focus back AND `document.body` focus returns). When
 *  that happens without a change event, we resolve to [] and clean up. */
function pickFilesViaInput(accept?: string): Promise<File[]> {
  return new Promise((resolve) => {
    const el = document.createElement("input");
    el.type = "file";
    el.multiple = true;
    if (accept) el.accept = accept;
    el.style.display = "none";
    document.body.appendChild(el);

    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(focusTimer);
      window.removeEventListener("focus", onFocusBack, true);
      // Defer one tick so onchange can still fire if it races us.
      window.setTimeout(() => {
        if (el.parentNode) el.remove();
      }, 0);
    };
    const settle = (files: File[]) => { cleanup(); resolve(files); };

    const focusTimer = window.setTimeout(() => settle([]), 5 * 60_000); // hard cap

    const onFocusBack = () => {
      // Browsers hand focus back to `window` shortly after the dialog
      // closes. onchange fires before this if a file was selected; if
      // we reach this listener first, treat it as a cancellation.
      // 800 ms grace window covers slow volumes (NFS, OneDrive, large
      // network filesystems) that occasionally take > 250 ms to surface
      // the chosen files into onchange.
      window.setTimeout(() => {
        if (!settled && (!el.files || el.files.length === 0)) settle([]);
      }, 800);
    };
    window.addEventListener("focus", onFocusBack, true);

    el.onchange = () => settle(Array.from(el.files ?? []));
    el.click();
  });
}

async function readTextFile(file: File, maxBytes = 200_000): Promise<string> {
  if (file.size > maxBytes) {
    return `Fichier trop volumineux (${file.size} octets — limite ${maxBytes}). Réduis la taille ou colle le texte directement.`;
  }
  return await file.text();
}

function saveBlobViaAnchor(filename: string, blob: Blob): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
      resolve();
    }, 0);
  });
}
