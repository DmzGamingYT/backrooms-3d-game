import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Top-level error boundary — prevents a white-screen crash if any
 * component throws during render or a lifecycle. The fallback shows
 * a glass panel with the error message and a reload button so the
 * user always has an escape hatch.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("Solis crashed:", error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen w-screen flex items-center justify-center"
          style={{ background: "var(--c-bg-deep)" }}
        >
          <div className="glass-heavy rounded-2xl p-8 max-w-md text-center">
            <p className="text-[10px] uppercase tracking-[0.5em] text-zinc-500">Solis</p>
            <h1 className="font-display text-2xl text-zinc-100 mt-4">
              Une erreur est survenue
            </h1>
            <p className="text-sm text-zinc-400 mt-3 leading-relaxed">
              {this.state.error?.message ?? "Erreur inconnue"}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 glass-soft rounded-full px-5 py-2.5 text-sm text-zinc-100 hover:scale-105 active:scale-95 transition"
            >
              Recharger
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
