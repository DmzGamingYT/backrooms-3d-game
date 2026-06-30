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
import { loadJSON, saveJSON } from "../utils/storage";

const TRANSCRIPT_KEY = "solis.transcript.v1";
const MODE_KEY = "solis.mode.v1";

/**
 * Unified conversation hook — owns transcript, voice state machine,
 * audio-reactivity level for the orb, and exposes both `toggleVoice`
 * (mic round-trip) and `sendMessage` (text round-trip). Both paths reach
 * the same `useAssistant.run(...)` so backend behaviour is identical.
 */
export function useVoice() {
  const backend = useBackend();

  // Lazy-init the AIManager on first render so the constructor never sees
  // a stale `defaultConfig` sneak through the spread.
  const managerRef = useRef<AIManager | null>(null);
  if (managerRef.current === null) {
    managerRef.current = new AIManager(backend.config);
  }
  useEffect(() => {
    managerRef.current?.setConfig(backend.config);
  }, [backend.config]);

  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>(() =>
    loadJSON<TranscriptEntry[]>(TRANSCRIPT_KEY, []),
  );
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>(() =>
    typeof window !== "undefined" && window.localStorage.getItem(MODE_KEY) === "text"
      ? "text"
      : "voice",
  );

  // Mutable mirror of transcript — share with useAssistant without
  // re-creating it on every entry.
  const transcriptRef = useRef(transcript);
  useEffect(() => {
    transcriptRef.current = transcript;
    saveJSON(TRANSCRIPT_KEY, transcript);
  }, [transcript]);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  const assistant = useAssistant({
    managerRef,
    transcriptRef,
    setTranscript,
    onError: setError,
    onSpeaking: () => setStatus("speaking"),
    onIdle: () => setStatus("idle"),
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
          // Lower-half average so the orb reacts to voice fundamentals
          // (≈300–3000 Hz bins) and ignores hiss / desktop noise.
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
        // onFinal is fired exactly once at session end with the joined
        // transcript. We DON'T push the user entry here — `stopStt()`'s
        // promise + `assistant.run(...)` does it atomically below so the
        // transcript gets exactly one user row per turn.
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
      // Cancel TTS + abort any in-flight LLM stream
      stopSpeaking();
      assistant.abort();
      setStatus("idle");
    }
    // status === "processing": intentionally no-op so the user can't
    // double-trigger runs while the assistant is partway through.
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
  };
}
