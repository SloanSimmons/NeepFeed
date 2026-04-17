import { Component } from 'react';

/**
 * Top-level error boundary. Keeps the app shell rendering if a child
 * component throws during render; shows a reset button and dumps the
 * error to console for debugging.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('NeepFeed error boundary:', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-full flex items-center justify-center p-6">
          <div className="card p-6 max-w-md text-center">
            <h2 className="text-lg font-semibold mb-2">Something broke.</h2>
            <p className="text-fg-muted text-sm mb-4">
              NeepFeed ran into an unexpected error. Reloading usually fixes it.
              If it keeps happening, check the browser console.
            </p>
            <pre className="text-xs text-fg-dim font-mono mb-4 whitespace-pre-wrap text-left max-h-40 overflow-auto">
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <div className="flex gap-2 justify-center">
              <button onClick={this.reset} className="btn text-sm">Try again</button>
              <button onClick={() => location.reload()} className="btn-primary text-sm">Reload</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
