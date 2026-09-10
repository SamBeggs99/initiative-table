import { Component, type ErrorInfo, type ReactNode } from 'react';
import { downloadText } from '../lib/session-log';
import { useStore } from '../store';

interface State {
  error: Error | null;
}

/**
 * A render throw anywhere in the tree used to white-screen the app mid-fight.
 * The campaign was still safe in localStorage, but the DM had no way to reach
 * it and no reason to believe it was there. This turns that into a recoverable
 * moment: say what happened, hand them their data, offer a reload.
 */
export class TableErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Dungeon Master MultiTool crashed', error, info.componentStack);
  }

  private exportCampaign = () => {
    try {
      const state = useStore.getState();
      const json = state.exportActiveCampaignJson();
      const name = state.getActiveCampaign()?.name ?? 'campaign';
      if (json) {
        downloadText(`${name}-recovered.json`, json, 'application/json');
        return;
      }
    } catch {
      /* fall through to the raw dump */
    }
    // Even if the store is too broken to export cleanly, the persisted blob is
    // still on disk — hand over the raw bytes rather than nothing.
    try {
      const raw = localStorage.getItem('initiative-table');
      if (raw) downloadText('dm-multitool-recovered.json', raw, 'application/json');
    } catch {
      /* nothing left to offer */
    }
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        className="flex min-h-full items-center justify-center p-6"
        role="alert"
      >
        <div className="card w-full max-w-lg p-5 shadow-2xl">
          <h1 className="sheet-title text-xl">Something broke</h1>
          <p className="mt-2 text-sm text-text">
            Your campaign is still saved on this device — this is a display
            failure, not lost data. Export a copy before reloading if you want
            to be certain.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={this.exportCampaign}
            >
              Export campaign
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => this.setState({ error: null })}
            >
              Try again without reloading
            </button>
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-muted">
              Technical detail
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded border border-border bg-panel-2 p-2 font-mono-stats text-[11px] whitespace-pre-wrap text-muted">
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ''}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
