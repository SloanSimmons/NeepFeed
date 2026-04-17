export default function EmptyState({ onOpenSettings, onTriggerCollection, stats }) {
  const noSubs = !stats || stats.active_subreddits === 0;
  const noPosts = stats && stats.active_subreddits > 0 && stats.total_posts === 0;

  if (noSubs) {
    return (
      <div className="card p-8 text-center">
        <h2 className="text-xl font-semibold mb-2">Welcome to NeepFeed</h2>
        <p className="text-fg-muted mb-6 max-w-md mx-auto">
          No subreddits yet. Add some to start seeing a feed. You can paste a list,
          import a Reddit/Apollo/Sync backup, or type them one at a time.
        </p>
        <button onClick={onOpenSettings} className="btn-primary">
          Open Settings →
        </button>
      </div>
    );
  }

  if (noPosts) {
    return (
      <div className="card p-8 text-center">
        <h2 className="text-xl font-semibold mb-2">No posts yet</h2>
        <p className="text-fg-muted mb-6">
          Your subreddits are set up but no collection has run yet.
        </p>
        <button onClick={onTriggerCollection} className="btn-primary">
          Fetch now
        </button>
      </div>
    );
  }

  return (
    <div className="card p-8 text-center text-fg-muted">
      Nothing to show with the current filters.
    </div>
  );
}
