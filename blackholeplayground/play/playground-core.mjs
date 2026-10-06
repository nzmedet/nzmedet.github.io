/** Gate device families, never window width: a narrow desktop is still supported. */
export function isHandheld(navigator = {}) {
  const ua = String(navigator.userAgent || '');
  return Boolean(navigator.userAgentData?.mobile)
    || /^Android$/i.test(String(navigator.userAgentData?.platform || ''))
    || /Android|iPhone|iPad|iPod|Mobile|Windows Phone|Silk\//i.test(ua)
    || ((navigator.platform === 'MacIntel' || /Macintosh/i.test(ua))
      && Number(navigator.maxTouchPoints || 0) > 1);
}

/** Keep the browser backing buffer bounded independently of CSS size or Retina. */
export function canvasResolution(width, height, devicePixelRatio = 1) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const dpr = Math.min(1, Math.max(0.1, Number(devicePixelRatio) || 1));
  const scale = Math.min(dpr, 1600 / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** The only launch entry point. The device gate precedes even the manifest fetch. */
export function createLaunchController({ navigator, loadBuild, runUnity, onChange = () => {} }) {
  let state = { status: isHandheld(navigator) ? 'blocked' : 'idle', progress: 0, error: '' };
  let pending = null;
  let instance = null;
  const update = (next) => { state = { ...state, ...next }; onChange({ ...state }); };
  onChange({ ...state });
  return {
    get state() { return { ...state }; },
    get instance() { return instance; },
    start() {
      if (state.status === 'blocked' || state.status === 'running') return Promise.resolve({ ...state });
      if (pending) return pending;
      update({ status: 'loading', progress: 0, error: '' });
      pending = (async () => {
        try {
          const build = await loadBuild();
          instance = await runUnity(build, (progress) => {
            if (state.status === 'loading' && Number.isFinite(progress)) {
              update({ progress: Math.min(1, Math.max(0, progress)) });
            }
          });
          update({ status: 'running', progress: 1 });
        } catch (error) {
          update({ status: 'error', error: error?.message || String(error) || 'The playground could not start.' });
        }
        return { ...state };
      })().finally(() => { pending = null; });
      return pending;
    },
  };
}
