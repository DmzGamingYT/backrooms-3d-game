import { useCallback, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type {
  BackendConfig,
  ChatOptions,
  LLMMessage,
  MessageEntry,
  StreamChunk,
  ToolCall,
  TranscriptEntry,
} from "../ai/types";
import { AIManager, SOLIS_SYSTEM_PROMPT } from "../ai/manager";
import { stripMarkdown } from "../ai/processText";
import { speak } from "../ai/speech/webSpeech";
import { uid } from "../utils/storage";
import type { SkillContext, SkillDefinition } from "../ai/skills/types";
import { SKILL_BY_NAME } from "../ai/skills/registry";

const MAX_CONTEXT_TURNS = 8;
/** Hard cap on tool-call round-trips per user turn — prevents infinite
 *  loops if the model keeps asking the same tool. */
const MAX_TOOL_ROUNDS = 4;

interface AssistantDeps {
  /** Ref to the active AIManager (lives on useVoice). */
  managerRef: MutableRefObject<AIManager | null>;
  /** Mirror of the transcript state — used for context, never mutated here. */
  transcriptRef: MutableRefObject<TranscriptEntry[]>;
  /** Setter used to push user + assistant entries + tool chip rows. */
  setTranscript: Dispatch<SetStateAction<TranscriptEntry[]>>;
  /** Surfaced mid-stream failures (HTTP error, missing key, etc). */
  onError?: (msg: string) => void;
  /** Called when tokens begin streaming (UI: turn to "speaking"). */
  onSpeaking?: () => void;
  /** Called once the assistant has finished streaming + optional TTS. */
  onIdle?: () => void;
  /** Skills advertised to the LLM (already filtered by user toggles). */
  effectiveSkills: SkillDefinition[];
  /** Builds the per-execution SkillContext for skill.execute(...). */
  buildCtx: () => SkillContext;
  /** Quick access to backend config (used for error microcopy / provider name). */
  configRef: MutableRefObject<BackendConfig>;
}

interface RunOptions {
  extraTools?: ChatOptions["tools"];
  maxTokens?: number;
}

/**
 * Shared assistant runner — used by both voice and chat paths. The
 * "user pushed this → tokens streamed → TTS played → idle" flow is
 * identical regardless of how the user input arrived. On top of that
 * base behaviour, `run` now drives the **tool-call loop**:
 *
 *   round 0..MAX:
 *     for-await stream chunks
 *       - text delta       → accumulate in bubble
 *       - tool_calls chunk → queue for execution after stream ends
 *     if no tool_calls  → done
 *     execute skills, append tool chips to transcript, push tool
 *     messages into the request and continue the loop.
 *
 * Errors are surfaced via `onError` and appended in-line to the
 * assistant bubble so the transcript stays self-contained.
 */
export function useAssistant({
  managerRef,
  transcriptRef,
  setTranscript,
  onError,
  onSpeaking,
  onIdle,
  effectiveSkills,
  buildCtx,
  configRef,
}: AssistantDeps) {
  const runIdRef = useRef(0);

  const run = useCallback(
    async (userText: string, opts: RunOptions = {}) => {
      const trimmed = userText.trim();
      if (!trimmed || !managerRef.current) return;

      const thisRun = ++runIdRef.current;

      // Push user entry first
      const userId = uid();
      setTranscript((cur) => [
        ...cur,
        { id: userId, kind: "message", role: "user", text: trimmed, timestamp: Date.now() } as TranscriptEntry,
      ]);

      // Reserve an empty assistant bubble that we'll fill token by token
      const replyId = uid();
      setTranscript((cur) => [
        ...cur,
        { id: replyId, kind: "message", role: "assistant", text: "", timestamp: Date.now() } as TranscriptEntry,
      ]);
      onSpeaking?.();

      const recent = transcriptRef.current.slice(-MAX_CONTEXT_TURNS);
      const recentMessages = recent.filter((m): m is MessageEntry => m.kind === "message");
      const messages: LLMMessage[] = [
        SOLIS_SYSTEM_PROMPT,
        ...recentMessages.map((m) => ({ role: m.role, content: m.text })),
        { role: "user" as const, content: trimmed },
      ];

      const markInterrupted = () => {
        const trailing = accumulated.trim();
        const text = trailing ? `${trailing} (interrompu)` : "(interrompu)";
        setTranscript((cur) =>
          cur.map((m) =>
            m.id === replyId && m.kind === "message" && m.role === "assistant"
              ? { ...m, text }
              : m,
          ),
        );
      };

      let accumulated = "";
      /** Models stuck in a malformed-JSON loop should not consume the
       *  entire tool-round budget on parse errors alone — after two
       *  consecutive parse failures we bail out of the tool loop so the
       *  model can emit a plain-text reply instead of degenerating into
       *  the "aucune réponse produite" branch with zero user-visible
       *  content. Reset on every successful parse. */
      let consecutiveParseErrors = 0;
      const MAX_CONSECUTIVE_PARSE_ERRORS = 2;
      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const pendingCalls: ToolCall[] = [];
          // Mock provider can't honour tool_calls — gate the tools
          // array on a non-mock backend so the system-prompt's
          // "if tools are available" hint doesn't mislead the user in
          // Démo mode (request + reply would echo without action).
          const isToolCapableProvider =
            managerRef.current?.currentProvider.id !== "mock";
          const tools = opts.extraTools ?? (isToolCapableProvider
            ? effectiveSkills
                .filter((s) => s.enabled())
                .map((s) => ({
                  type: "function" as const,
                  function: {
                    name: s.name,
                    description: s.description,
                    parameters: s.parameters,
                  },
                }))
            : undefined);

          if (!managerRef.current) return;
          for await (const chunk of streamOnce(managerRef.current, messages, tools, opts)) {
            if (runIdRef.current !== thisRun) { markInterrupted(); return; }
            if (chunk.kind === "tool_calls") {
              pendingCalls.push(...chunk.calls);
            } else {
              accumulated += chunk.delta;
              setTranscript((cur) =>
                cur.map((m) =>
                  m.id === replyId && m.kind === "message" && m.role === "assistant"
                    ? { ...m, text: accumulated }
                    : m,
                ),
              );
            }
          }

          if (pendingCalls.length === 0) break;

          // Bail out of the tool loop early if the model is stuck
          // emitting unparseable JSON. We still push the latest tool
          // message(s) below so the model has the context for its final
          // text reply, but the loop won't request another round.
          if (consecutiveParseErrors > MAX_CONSECUTIVE_PARSE_ERRORS) break;

          // Record the assistant message that asked for tools so the
          // model can reference its own utterance on the next turn.
          messages.push({ role: "assistant", content: accumulated, tool_calls: pendingCalls });

          const ctx = buildCtx();
          for (const tc of pendingCalls) {
            if (runIdRef.current !== thisRun) { markInterrupted(); return; }
            const skill = SKILL_BY_NAME[tc.function.name];
            let resultText = "";
            let ok = false;
            let args: Record<string, unknown> = {};
            if (!skill) {
              resultText = `Skill inconnue : ${tc.function.name}`;
              ok = false;
            } else {
              // Parse tool arguments explicitly. Small open models
              // (Llama 3.1 8b in particular) frequently emit broken
              // JSON — silently falling back to {} makes the skill
              // "succeed" with empty args, masking the failure from
              // the model. Instead we surface the parse error to the
              // model via a tool message so it can retry with a fixed
              // payload. The skill itself is NOT executed in that
              // branch — it would only observe the bad data.
              let parseError: string | null = null;
              try {
                args = JSON.parse(tc.function.arguments || "{}");
              } catch (err) {
                args = {};
                parseError = `Erreur de parsing JSON des arguments pour « ${tc.function.name} » : ${(err as Error)?.message ?? String(err)}. Renvoie un arguments JSON valide qui respecte exactement le schéma de l'outil.`;
              }

              if (parseError) {
                resultText = parseError;
                ok = false;
                consecutiveParseErrors++;
              } else {
                consecutiveParseErrors = 0;
                try {
                  const res = await skill.execute(args, ctx);
                  resultText = res.text;
                  ok = res.ok;
                } catch (err) {
                  resultText = `Erreur : ${(err as Error)?.message ?? String(err)}`;
                  ok = false;
                }
                // Stale-check immediately after the await so an abort during
                // the skill doesn't leak the chip + tool message into the
                // transcript/request.
                if (runIdRef.current !== thisRun) { markInterrupted(); return; }
              }
            }

            // Surface a chip row in the transcript (collapsible in UI).
            const chipId = uid();
            const preview = resultText.length > 120 ? `${resultText.slice(0, 120)}…` : resultText;
            setTranscript((cur) => [
              ...cur,
              {
                id: chipId,
                kind: "tool",
                name: tc.function.name,
                label: tc.function.name,
                args,
                result: resultText,
                preview,
                ok,
                timestamp: Date.now(),
              } as TranscriptEntry,
            ]);

            // Push the tool message back into the request so the model
            // has access to the result on the next round.
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              name: tc.function.name,
              content: resultText,
            });
          }
          // Continue the loop — accumulated + bubble get further deltas
          // on the next round (and the bubble text grows in place).
        }
        if (runIdRef.current === thisRun) {
          // Fell off without producing a final round — guard against
          // a model that keeps calling tools forever.
          if (accumulated.length === 0) {
            setTranscript((cur) =>
              cur.map((m) =>
                m.id === replyId && m.kind === "message" && m.role === "assistant"
                  ? { ...m, text: "(aucune réponse produite — limite de tours atteinte)" }
                  : m,
              ),
            );
          }
        }
      } catch (e) {
        const msg = (e as Error)?.message ?? String(e);
        const providerName = managerRef.current?.currentProvider.displayName ?? configRef.current.kind;
        onError?.(`${providerName} — ${msg}`);
        if (runIdRef.current !== thisRun) { markInterrupted(); return; }
        const note = `(${providerName} indisponible : ${msg})`;
        accumulated = `${accumulated}${accumulated ? " " : ""}${note}`;
        setTranscript((cur) =>
          cur.map((m) =>
            m.id === replyId && m.kind === "message" && m.role === "assistant"
              ? { ...m, text: accumulated }
              : m,
          ),
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
    [effectiveSkills, buildCtx],
  );

  /** Aborts the running stream (if any) — increments the run id so the
   *  loop's stale-guard fires on the next tick. */
  const abort = useCallback(() => {
    runIdRef.current++;
  }, []);

  return { run, abort } as const;
}

/**
 * Helper that wraps a single streaming round — keeps the loop in `run`
 * readable. Just yields whatever chunks the provider emits.
 */
async function* streamOnce(
  mgr: AIManager,
  messages: LLMMessage[],
  tools: ChatOptions["tools"],
  opts: RunOptions,
): AsyncGenerator<StreamChunk, void, undefined> {
  yield* mgr.stream(messages, {
    tools,
    maxTokens: opts.maxTokens,
  });
}
