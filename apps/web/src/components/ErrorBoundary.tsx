import { Component, type ErrorInfo, type ReactNode } from "react";
import { LogoMark } from "./Icons";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unexpected interface error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-bg px-6">
          <div className="max-w-md rounded-3xl border border-line bg-surface p-8 text-center shadow-soft">
            <LogoMark size={44} className="mx-auto" />
            <h1 className="mt-4 font-serif text-3xl text-fg">The interface hit a snag.</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Your library is still safe in the local database. Reload the page to try again.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong"
            >
              Reload the studio
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
