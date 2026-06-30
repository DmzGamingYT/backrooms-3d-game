import { useCallback, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { LLMMessage, TranscriptEntry } from "../ai/types";
import { AIManager, SOLIS_SYSTEM_PROMPT } from "../ai/manager";
import { stripMarkdown } from "../ai/processText";
import { speak } from "../ai/speech/webSpeech";
import { uid } from "../utils/storage";

const MAX_CONTEXT_TURNS = 8;

interface AssistantDeps {
  /** Ref to the active AIManager (lives on useVoice). */
  managerRef: MutableRefObject<AIManager | null>;
  /** Mirror of the transcript state — used for context, never mutated here. */
  transcriptRef: MutableRefObject<TranscriptEntry[]>;
  /** Setter used to push user + assistant entries. */
  setTranscript: Dispatch<SetStateAction<TranscriptEntry[]>>;
  /** Surfaced mid-stream failures (HTTP error, missing key, etc). */
  onError?: (msg: string) => void;
  /** Called when tokens begin streaming (UI: turn to "speaking"). */
  onSpeaking?: () => void;
  /** Called once the assistant has finished streaming + optional TTS. */
  onIdle?: () => void;
}

/**
 * Shared assistant runner — used by both voice and chat paths so the
 * "user pushed this → tokens streamed → TTS played → idle" flow is
 * identical regardless of how the user input arrived.
 *
 * Errors are surfaced via `onError` and appended in-line to the
 * assistant bubble so the transcript stays self-contained (a user
 * reading the conversation sees WHY the response was cut off).
 */
export function useAssistant({
  managerRef,
  transcriptRef,
  setTranscript,
  onError,
  onSpeaking,
  onIdle,
}: AssistantDeps) {
  // Bumped on every new run / abort. The async loop guards on this so an
  // earlier (slow) stream that loses to an abort doesn't keep polluting the
  // transcript bubble with stale tokens.
  const runIdRef = useRef(0);

  const run = useCallback(
    async (userText: string) => {
      const trimmed = userText.trim();
      if (!trimmed || !managerRef.current) return;

      const thisRun = ++runIdRef.current;

      // Push user entry first
      setTranscript((cur) => [
        ...cur,
        { id: uid(), role: "user", text: trimmed, timestamp: Date.now() },
      ]);

      // Reserve an empty assistant bubble that we'll fill token by token
      const replyId = uid();
      setTranscript((cur) => [
        ...cur,
        { id: replyId, role: "assistant", text: "", timestamp: Date.now() },
      ]);
      onSpeaking?.();

      const recent = transcriptRef.current.slice(-MAX_CONTEXT_TURNS);
      const messages: LLMMessage[] = [
        SOLIS_SYSTEM_PROMPT,
        ...recent.map((m) => ({ role: m.role, content: m.text })),
        { role: "user", content: trimmed },
      ];

      /** Mark the assistant bubble as interrupted — always used at every
       *  stale-check exit point so we never leave a perpetually-empty
       *  placeholder in the transcript. */
      const markInterrupted = () => {
        const trailing = accumulated.trim();
        const text = trailing ? `${trailing} (interrompu)` : "(interrompu)";
        setTranscript((cur) =>
          cur.map((m) => (m.id === replyId ? { ...m, text } : m)),
        );
      };

      let accumulated = "";
      try {
        if (!managerRef.current) return;
        for await (const chunk of managerRef.current.stream(messages)) {
          if (runIdRef.current !== thisRun) { markInterrupted(); return; }
          accumulated += chunk;
          setTranscript((cur) =>
            cur.map((m) => (m.id === replyId ? { ...m, text: accumulated } : m)),
          );
        }
      } catch (e) {
        const msg = (e as Error)?.message ?? String(e);
        const providerName = managerRef.current?.currentProvider.displayName ?? "Backend";
        onError?.(`${providerName} — ${msg}`);
        if (runIdRef.current !== thisRun) { markInterrupted(); return; }
        const note = `(${providerName} indisponible : ${msg})`;
        accumulated = `${accumulated}${accumulated ? " " : ""}${note}`;
        setTranscript((cur) =>
          cur.map((m) => (m.id === replyId ? { ...m, text: accumulated } : m)),
        );
      }

      if (runIdRef.current !== thisRun) { markInterrupted(); return; }

      // TTS — only after the full reply is in. We strip Markdown first
      // because we never want `*emphasis*` or `## Heading` read aloud.
      const ttsText = stripMarkdown(accumulated).trim();
      if (ttsText) {
        try { await speak(ttsText); } catch { /* TTS failure is silent */ }
      }

      if (runIdRef.current === thisRun) onIdle?.();
    },
    [],
  );

  /** Aborts the running stream (if any) — increments the run id so the
   *  loop's `runIdRef.current !== thisRun` guard fires on the next tick. */
  const abort = useCallback(() => {
    runIdRef.current++;
  }, []);

  return { run, abort } as const;
}
