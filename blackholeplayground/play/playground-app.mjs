import { canvasResolution, createLaunchController } from './playground-core.mjs';
import { fetchBuild, instantiateUnity } from './playground-loader.mjs';

const el = (id) => document.getElementById(id);
const desktop = el('desktop-playground');
const stage = el('stage');
const canvas = el('unity-canvas');
const resizeCanvas = () => {
  const rect = stage.getBoundingClientRect();
  const size = canvasResolution(rect.width, rect.height, window.devicePixelRatio);
  if (canvas.width !== size.width) canvas.width = size.width;
  if (canvas.height !== size.height) canvas.height = size.height;
};
const showRuntimeMessage = (message) => {
  el('runtime-message').textContent = String(message);
  el('runtime-message').hidden = false;
};
const renderState = (state) => {
  el('device-check').hidden = true;
  el('mobile-gate').hidden = state.status !== 'blocked';
  desktop.hidden = state.status === 'blocked';
  el('loading-panel').hidden = state.status !== 'loading';
  el('error-panel').hidden = state.status !== 'error';
  canvas.hidden = state.status !== 'running' && state.status !== 'loading';
  el('loading-progress').value = state.progress;
  el('loading-percent').textContent = `${Math.round(state.progress * 100)}%`;
  if (state.status === 'error') el('error-message').textContent = state.error;
  if (state.status === 'loading') { el('runtime-message').hidden = true; resizeCanvas(); }
  if (state.status === 'running') { resizeCanvas(); canvas.focus({ preventScroll: true }); }
};

const controller = createLaunchController({
  navigator: window.navigator,
  onChange: renderState,
  loadBuild: async () => {
    if (typeof WebAssembly !== 'object') throw new Error('This browser does not support WebAssembly. Please use a current desktop browser.');
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) throw new Error('WebGL 2 is unavailable. Enable hardware acceleration or try another desktop browser.');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return fetchBuild(window.fetch.bind(window), new URL('./unity-build.json', import.meta.url).href);
  },
  runUnity: (config, onProgress) => instantiateUnity({
    document, window, canvas, config, onProgress,
    onBanner: (message, type) => { if (type === 'error' || type === 'warning') showRuntimeMessage(message); },
  }),
});

el('retry').addEventListener('click', () => controller.start());
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  showRuntimeMessage('The graphics connection was interrupted. Reload this page to open the playground again.');
});
if (controller.state.status !== 'blocked') {
  document.addEventListener('gargantua-fullscreen-toggle', async () => {
    if (controller.state.status !== 'running' || !controller.instance) return;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
        else showRuntimeMessage('Fullscreen is unavailable in this browser. Press Escape to leave it.');
      } else if (stage.requestFullscreen) await stage.requestFullscreen();
      else if (stage.webkitRequestFullscreen) await stage.webkitRequestFullscreen();
      else showRuntimeMessage('Fullscreen is unavailable in this browser. You can enlarge the browser window instead.');
    } catch { showRuntimeMessage('Fullscreen could not change. Try again or press Escape.'); }
  });
  new ResizeObserver(resizeCanvas).observe(stage);
  document.addEventListener('fullscreenchange', resizeCanvas);
  document.addEventListener('webkitfullscreenchange', resizeCanvas);
  controller.start();
}
