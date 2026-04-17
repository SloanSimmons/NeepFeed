import { useEffect, useState } from 'react';

export default function App() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 backdrop-blur bg-bg/80 border-b border-white/5">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand" />
            <h1 className="text-lg font-semibold tracking-tight">NeepFeed</h1>
          </div>
          <div className="text-sm text-fg-muted">
            {health ? `${health.posts} posts · ${health.active_subreddits} subs` : '…'}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="card p-6">
          <h2 className="text-xl font-semibold mb-2">Welcome to NeepFeed</h2>
          <p className="text-fg-muted mb-4">
            Scaffold is up. Add subreddits from Settings (coming in M5) or wait for the collection job (M2).
          </p>
          {error && (
            <div className="text-red-400 text-sm font-mono">API unreachable: {error}</div>
          )}
          {health && (
            <pre className="text-xs text-fg-muted font-mono whitespace-pre-wrap">
              {JSON.stringify(health, null, 2)}
            </pre>
          )}
        </div>

        <div className="mt-6 text-sm text-fg-dim">
          <p>
            M1 · Skeleton · <span className="text-brand">in progress</span>
          </p>
        </div>
      </main>
    </div>
  );
}
