import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { BUILTIN_SKINS, findBuiltin, DARK } from '../skins/builtin.js';
import { validateSkin } from '../skins/contrast.js';

const LS_KEY = 'neepfeed_active_skin';

function applyToDOM(variables) {
  const root = document.documentElement;
  Object.entries(variables || {}).forEach(([k, v]) => {
    if (typeof v === 'string' && k.startsWith('--nf-')) {
      root.style.setProperty(k, v);
    }
  });
}

function clearInlineVars() {
  const root = document.documentElement;
  for (let i = root.style.length - 1; i >= 0; i--) {
    const prop = root.style.item(i);
    if (prop.startsWith('--nf-')) root.style.removeProperty(prop);
  }
}

/**
 * useSkin — manages the active skin, custom skins, and live preview state.
 *
 * Exposes:
 *   active        — name of the currently applied skin
 *   custom        — array of custom skin objects
 *   allSkins      — built-ins + custom, flattened
 *   preview       — skin currently being previewed (null if not previewing)
 *   isPreviewing  — boolean
 *   contrastIssues— [{label, ratio, level, passes}, ...] from the active preview
 *   selectSkin(name)         — set active (saves to backend + localStorage)
 *   previewSkin(skinObject)  — enter preview mode with the given skin object
 *   applyPreview()           — commit preview as active
 *   cancelPreview()          — revert to active skin
 *   importCustom(skinObject) — save as custom, keep previewing
 *   deleteCustom(name)       — remove custom skin (reverts to dark if active)
 */
export function useSkin() {
  const [active, setActive] = useState('dark');
  const [custom, setCustom] = useState([]);
  const [preview, setPreview] = useState(null);
  const [contrastIssues, setContrastIssues] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const initialAppliedRef = useRef(false);

  const allSkins = useMemo(() => [...BUILTIN_SKINS, ...custom], [custom]);
  const isPreviewing = preview != null;

  const findSkin = useCallback(
    (name) => allSkins.find((s) => s.name === name) || findBuiltin(name) || DARK,
    [allSkins],
  );

  // Apply a skin: merge variables over DARK defaults so partial skins inherit.
  const apply = useCallback((skin) => {
    if (!skin) return;
    clearInlineVars();
    const merged = { ...DARK.variables, ...(skin.variables || {}) };
    applyToDOM(merged);
  }, []);

  // Load from backend on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.skins();
        if (cancelled) return;
        setCustom(data.custom || []);
        setActive(data.active || 'dark');
        const skin = (data.custom || []).find((s) => s.name === data.active)
                  || findBuiltin(data.active) || DARK;
        apply(skin);
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(skin));
        } catch {}
        initialAppliedRef.current = true;
      } catch {
        // Network error: use whatever localStorage has (already applied pre-React by flash script)
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [apply]);

  // Recompute contrast whenever preview changes
  useEffect(() => {
    if (!preview) { setContrastIssues([]); return; }
    const merged = { ...DARK.variables, ...(preview.variables || {}) };
    setContrastIssues(validateSkin(merged));
  }, [preview]);

  const selectSkin = useCallback(async (name) => {
    const skin = findSkin(name);
    setActive(name);
    apply(skin);
    try { localStorage.setItem(LS_KEY, JSON.stringify(skin)); } catch {}
    try { await api.setActiveSkin(name); } catch {}
  }, [findSkin, apply]);

  const previewSkin = useCallback((skin) => {
    if (!skin || !skin.variables) return;
    setPreview(skin);
    apply(skin);
  }, [apply]);

  const cancelPreview = useCallback(() => {
    setPreview(null);
    apply(findSkin(active));
  }, [findSkin, active, apply]);

  const applyPreview = useCallback(async () => {
    if (!preview) return;
    const skin = preview;
    // If skin isn't known (fresh import), persist it first
    const isBuiltin = !!findBuiltin(skin.name);
    const isCustom = custom.some((s) => s.name === skin.name);
    if (!isBuiltin && !isCustom) {
      try {
        await api.saveSkin(skin);
        setCustom((prev) => [...prev, skin]);
      } catch (e) {
        console.error('save skin failed', e);
        return;
      }
    }
    setPreview(null);
    setActive(skin.name);
    apply(skin);
    try { localStorage.setItem(LS_KEY, JSON.stringify(skin)); } catch {}
    try { await api.setActiveSkin(skin.name); } catch {}
  }, [preview, custom, apply]);

  const importCustom = useCallback(async (skin) => {
    // Enter preview mode with the imported skin (unsaved)
    previewSkin(skin);
  }, [previewSkin]);

  const deleteCustom = useCallback(async (name) => {
    if (findBuiltin(name)) return;
    try {
      await api.deleteSkin(name);
      setCustom((prev) => prev.filter((s) => s.name !== name));
      if (active === name) {
        await selectSkin('dark');
      }
    } catch (e) { console.error('delete skin failed', e); }
  }, [active, selectSkin]);

  return {
    active,
    custom,
    allSkins,
    preview,
    isPreviewing,
    contrastIssues,
    loaded,
    selectSkin,
    previewSkin,
    applyPreview,
    cancelPreview,
    importCustom,
    deleteCustom,
  };
}
