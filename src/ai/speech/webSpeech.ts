/**
 * Browser-native speech engine.
 *
 *   STT: opens a recognition session, streams interim results live
 *        to the UI, and emits a SINGLE final transcript on stop (or
 *        natural end). Single-final is intentional — the rest of the
 *        app expects one user message per turn, not one user row per
 *        recognised fragment.
 *
 *   TTS: thin `speechSynthesis` wrapper. Locale comes from the
 *        browser (`navigator.language`) — no hard-coded "fr-FR" so a
 *        user speaking English gets an English voice.
 *
 * Capability flags (`isSTTSupported`, `isTTSSupported`) let the UI
 * degrade gracefully on Firefox/iOS where those APIs don't exist.
 */

export interface SttCallbacks {
  /** Stream of interim partial transcripts (live transcript preview). */
  onInterim: (text: string) => void;
  /** Fires exactly once at session end with the concatenated final text. */
  onFinal: (text: string) => void;
  onError: (err: Error) => void;
  onEnd: () => void;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: ((e: any) => void) | null;
  start(): void;
  stop(): void;
}

function getRecognitionCtor(): { new (): RecognitionLike } | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isSTTSupported(): boolean {
  return !!getRecognitionCtor();
}

export function isTTSSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Best-effort locale for STT/TTS. Falls back to "fr-FR" only on
 *  fully anonymous browsers (extremely rare). */
function detectLocale(): string {
  if (typeof navigator === "undefined") return "fr-FR";
  const lang = navigator.language?.trim();
  return lang || "fr-FR";
}

interface ActiveSession {
  recognition: RecognitionLike;
  finalText: string;
  interrupted: boolean;
  /** Resolves once `onend` has fired (whether manual stop or auto-stop). */
  endedPromise: Promise<string>;
  resolveEnded: (text: string) => void;
}

let active: ActiveSession | null = null;

export function startStt(callbacks: SttCallbacks): boolean {
  if (active) return false;

  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    callbacks.onError(new Error("Reconnaissance vocale indisponible dans ce navigateur."));
    return false;
  }

  const recognition: RecognitionLike = new Ctor();
  recognition.lang = detectLocale();
  recognition.continuous = true;
  recognition.interimResults = true;

  let resolveEnded!: (text: string) => void;
  const endedPromise = new Promise<string>((resolve) => { resolveEnded = resolve; });

  const session: ActiveSession = {
    recognition,
    finalText: "",
    interrupted: false,
    endedPromise,
    resolveEnded,
  };

  recognition.onresult = (e: any) => {
    if (session.interrupted) return;
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      const text = result[0]?.transcript ?? "";
      if (result.isFinal) {
        session.finalText = (session.finalText + " " + text).trim();
      } else {
        interim += text;
      }
    }
    if (interim) callbacks.onInterim(interim.trim());
  };

  recognition.onerror = (e: any) => {
    callbacks.onError(new Error(e?.error ?? "Erreur vocale"));
  };

  recognition.onend = () => {
    callbacks.onEnd();
    const finalText = session.finalText.trim();
    // Fire onFinal ONCE here — registers the recognised turn as a single
    // user entry in the transcript. Guarded so an explicit stopStt() that
    // already fired onFinal won't double-push.
    if (!session.interrupted) {
      callbacks.onFinal(finalText);
    }
    session.resolveEnded(finalText);
    if (active === session) active = null;
  };

  try {
    recognition.start();
  } catch (err) {
    callbacks.onError(err as Error);
    return false;
  }

  active = session;
  return true;
}

/**
 * Stop recognition; resolves with the captured final transcript. Safe to
 * call when no session is active (resolves to ""). Awaiting this is the
 * canonical signal that the user's turn is "done" and the assistant can
 * fire its stream next.
 */
export function stopStt(): Promise<string> {
  if (!active) return Promise.resolve("");
  const session = active;
  return new Promise<string>((resolve) => {
    // Stash the resolver — onend will call it with the final text.
    session.resolveEnded = resolve;
    try {
      session.recognition.stop();
    } catch {
      session.endedPromise.then(resolve);
    }
  });
}

export function speak(text: string, lang = detectLocale()): Promise<void> {
  return new Promise((resolve) => {
    if (!isTTSSupported() || !text) { resolve(); return; }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = 1.02;
    utter.pitch = 1.0;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    try {
      window.speechSynthesis.speak(utter);
    } catch {
      resolve();
    }
  });
}

export function stopSpeaking(): void {
  if (!isTTSSupported()) return;
  try { window.speechSynthesis.cancel(); } catch { /* noop */ }
}
