// Tiny fetch wrapper; all endpoints return JSON or throw.
const base = '';

// Helper for the /import endpoints which accept either plaintext or JSON body
// and have to tolerate non-JSON error bodies gracefully.
async function rawImport(path, body, contentType) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': contentType, Accept: 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : { raw: await res.text() };
  if (!res.ok) {
    const err = new Error(`${res.status} ${res.statusText}: ${JSON.stringify(data)}`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

async function req(path, { method = 'GET', body, signal } = {}) {
  const opts = { method, signal, headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(base + path, opts);
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await r.json() : await r.text();
  if (!r.ok) {
    const err = new Error(`${r.status} ${r.statusText}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    err.status = r.status;
    err.payload = data;
    throw err;
  }
  return data;
}

export const api = {
  // Feed
  feed: (params = {}, opts = {}) => {
    const q = new URLSearchParams(params).toString();
    return req(`/api/feed${q ? `?${q}` : ''}`, opts);
  },
  search: (q, params = {}, opts = {}) => req(`/api/search?${new URLSearchParams({ q, ...params })}`, opts),

  // Subreddits
  subreddits: () => req('/api/subreddits'),
  addSub: (name) => req('/api/subreddits', { method: 'POST', body: { action: 'add', name } }),
  removeSub: (name) => req('/api/subreddits', { method: 'POST', body: { action: 'remove', name } }),
  toggleSub: (name) => req('/api/subreddits', { method: 'POST', body: { action: 'toggle', name } }),
  setSubWeight: (name, weight) => req(`/api/subreddits/${encodeURIComponent(name)}/weight`, { method: 'PATCH', body: { weight } }),
  updateSub: (name, patch) => req(`/api/subreddits/${encodeURIComponent(name)}`, { method: 'PATCH', body: patch }),
  importSubs: async (body, contentType = 'application/json') => {
    return rawImport('/api/subreddits/import', body, contentType);
  },
  importSubsIntoList: async (listId, body, contentType = 'application/json') => {
    return rawImport(`/api/lists/${listId}/subreddits/import`, body, contentType);
  },
  importList: (payload) => req('/api/lists/import', { method: 'POST', body: payload }),

  // Lists
  lists: () => req('/api/lists'),
  createList: (body) => req('/api/lists', { method: 'POST', body }),
  updateList: (id, body) => req(`/api/lists/${id}`, { method: 'PATCH', body }),
  deleteList: (id) => req(`/api/lists/${id}`, { method: 'DELETE' }),
  listSubreddits: (id) => req(`/api/lists/${id}/subreddits`),
  addSubToList: (id, name) => req(`/api/lists/${id}/subreddits`, { method: 'POST', body: { action: 'add', name } }),
  removeSubFromList: (id, name) => req(`/api/lists/${id}/subreddits`, { method: 'POST', body: { action: 'remove', name } }),
  toggleSubInList: (id, name) => req(`/api/lists/${id}/subreddits`, { method: 'POST', body: { action: 'toggle', name } }),
  setSubWeightInList: (id, name, weight) => req(`/api/lists/${id}/subreddits/${encodeURIComponent(name)}/weight`, { method: 'PATCH', body: { weight } }),
  listRecommendations: (id) => req(`/api/lists/${id}/recommendations`),

  // Settings
  settings: () => req('/api/settings'),
  updateSettings: (patch) => req('/api/settings', { method: 'POST', body: patch }),
  exportConfig: () => fetch('/api/config/export', { method: 'POST' }).then((r) => r.blob()),
  importConfig: (payload) => req('/api/config/import', { method: 'POST', body: payload }),

  // Posts
  markSeen: (redditId) => req(`/api/posts/${redditId}/seen`, { method: 'POST' }),
  markSeenBatch: (redditIds) => req('/api/posts/seen-batch', { method: 'POST', body: { reddit_ids: redditIds } }),
  toggleBookmark: (redditId, bookmarked) =>
    req(`/api/posts/${redditId}/bookmark`, { method: 'POST', body: bookmarked === undefined ? {} : { bookmarked } }),
  hidePost: (redditId) => req(`/api/posts/${redditId}/hidden`, { method: 'POST' }),
  unhidePost: (redditId) => req(`/api/posts/${redditId}/hidden`, { method: 'DELETE' }),
  refreshVideo: (redditId) => req(`/api/posts/${redditId}/refresh-video`),
  bookmarks: (params = {}, opts = {}) => req(`/api/bookmarks?${new URLSearchParams(params)}`, opts),

  // Blocklist
  blocklist: () => req('/api/blocklist'),
  addBlock: (type, value) => req('/api/blocklist', { method: 'POST', body: { action: 'add', type, value } }),
  removeBlock: (type, value) => req('/api/blocklist', { method: 'POST', body: { action: 'remove', type, value } }),

  // Stats + collection
  stats: () => req('/api/stats'),
  triggerCollection: () => req('/api/collect/trigger', { method: 'POST' }),
  health: () => req('/api/health'),

  // Skins
  skins: () => req('/api/skins'),
  saveSkin: (skin) => req('/api/skins', { method: 'POST', body: skin }),
  updateSkin: (name, skin) => req(`/api/skins/${encodeURIComponent(name)}`, { method: 'PATCH', body: skin }),
  deleteSkin: (name) => req(`/api/skins/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  setActiveSkin: (name) => req('/api/skins/active', { method: 'POST', body: { name } }),
};
