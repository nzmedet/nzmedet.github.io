import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { canvasResolution, createLaunchController } from '../playground-core.mjs';
import { fetchBuild, instantiateUnity } from '../playground-loader.mjs';

const desktopNavigator = { userAgent: 'Macintosh Safari', platform: 'MacIntel', maxTouchPoints: 0 };
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
// Run the real module body with real imports and a browser URL. Fixture globals
// remain alive through the fullscreen event and its asynchronous completion.
const source = readFileSync(new URL('../playground-app.mjs', import.meta.url), 'utf8')
  .replace(/^import[^\n]+\n/gm, '')
  .replaceAll('import.meta.url', 'wrapperModuleUrl');

function openWrapper({ navigator = desktopNavigator, fullscreen = 'standard', rejectFullscreen = false, holdBuild = false, failFirstBuild = false } = {}) {
  const requests = [];
  const transitions = [];
  const nodes = new Map();
  let rect = { width: 320, height: 370 };
  let finishBuild;
  let buildAttempts = 0;
  const buildReady = holdBuild ? new Promise((resolve) => { finishBuild = resolve; }) : Promise.resolve();
  for (const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    nodes.set(tag[1], {
      hidden: /\bhidden\b/.test(tag[0]), handlers: {}, width: 960, height: 540,
      addEventListener(type, callback) { this.handlers[type] = callback; },
      getBoundingClientRect: () => rect,
      focus() {},
    });
  }
  class Document extends EventTarget {
    getElementById(id) { return nodes.get(id) ?? null; }
    createElement() { return { getContext: () => ({ getExtension: () => ({ loseContext() {} }) }) }; }
    head = { append(script) { requests.push(['script', script.src]); } };
  }
  const document = new Document();
  const stage = nodes.get('stage');
  const enter = async (kind) => {
    transitions.push('enter:' + kind);
    if (rejectFullscreen) throw new Error('Browser declined fullscreen');
    document[kind === 'standard' ? 'fullscreenElement' : 'webkitFullscreenElement'] = stage;
    rect = { width: 2100, height: 1000 };
    document.dispatchEvent(new Event(kind === 'standard' ? 'fullscreenchange' : 'webkitfullscreenchange'));
  };
  const exit = async (kind) => {
    transitions.push('exit:' + kind);
    document[kind === 'standard' ? 'fullscreenElement' : 'webkitFullscreenElement'] = null;
    rect = { width: 320, height: 370 };
    document.dispatchEvent(new Event(kind === 'standard' ? 'fullscreenchange' : 'webkitfullscreenchange'));
  };
  if (fullscreen === 'standard') {
    stage.requestFullscreen = () => enter('standard');
    document.exitFullscreen = () => exit('standard');
  } else if (fullscreen === 'webkit') {
    stage.webkitRequestFullscreen = () => enter('webkit');
    document.webkitExitFullscreen = () => exit('webkit');
  }
  const window = {
    navigator, devicePixelRatio: 2,
    fetch: async (url) => {
      requests.push(['manifest', url]);
      await buildReady;
      if (++buildAttempts === 1 && failFirstBuild) return { ok: false, status: 503 };
      return { ok: true, json: async () => ({ loaderUrl: 'Build/test.loader.js', dataUrl: 'Build/test.data', frameworkUrl: 'Build/test.framework.js', codeUrl: 'Build/test.wasm' }) };
    },
    createUnityInstance: async (canvas, config, progress) => {
      requests.push(['unity', config]); progress(0.5); return {};
    },
  };
  const ResizeObserver = class { constructor(callback) { this.callback = callback; } observe() { this.callback(); } };
  vm.runInNewContext(source, {
    window, document, ResizeObserver, WebAssembly: {}, URL,
    canvasResolution, createLaunchController, fetchBuild, instantiateUnity,
    wrapperModuleUrl: 'http://localhost:8765/blackholeplayground/play/playground-app.mjs',
  }, { filename: 'playground-app.mjs' });
  return {
    requests, transitions, nodes, document, finishBuild,
    retry: () => nodes.get('retry').handlers.click(),
    settle: () => new Promise((resolve) => setImmediate(resolve)),
    async toggleFullscreen() {
      document.dispatchEvent(new CustomEvent('gargantua-fullscreen-toggle'));
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

for (const [name, navigator] of [
  ['iPhone', { userAgent: 'iPhone Mobile', platform: 'iPhone', maxTouchPoints: 5 }],
  ['iPad using desktop UA', { userAgent: 'Macintosh Safari', platform: 'MacIntel', maxTouchPoints: 5 }],
  ['Android tablet', { userAgent: 'Linux; Android 15; Tablet', maxTouchPoints: 5 }],
]) {
  test('actual wrapper gates ' + name + ' without any manifest or Unity request', async () => {
    const fixture = openWrapper({ navigator });
    await fixture.settle();
    await fixture.toggleFullscreen();
    assert.equal(fixture.nodes.get('mobile-gate').hidden, false);
    assert.equal(fixture.nodes.get('desktop-playground').hidden, true);
    assert.equal(fixture.nodes.get('device-check').hidden, true);
    assert.deepEqual(fixture.requests, []);
    assert.deepEqual(fixture.transitions, []);
    assert.equal(fixture.nodes.get('runtime-message').hidden, true);
  });
}
test('320px desktop immediately fetches and autostarts Unity exactly once', async () => {
  const fixture = openWrapper();
  assert.equal(fixture.nodes.get('desktop-playground').hidden, false);
  assert.equal(fixture.nodes.get('mobile-gate').hidden, true);
  assert.deepEqual(fixture.requests.map(([kind]) => kind), ['manifest']);
  assert.equal(fixture.nodes.get('loading-panel').hidden, false);
  await fixture.settle();
  assert.deepEqual(fixture.requests.map(([kind]) => kind), ['manifest', 'unity']);
  assert.equal(fixture.nodes.get('unity-canvas').hidden, false);
  assert.equal(fixture.nodes.get('loading-panel').hidden, true);
  await fixture.settle();
  assert.deepEqual(fixture.requests.map(([kind]) => kind), ['manifest', 'unity']);
  assert.deepEqual(fixture.transitions, []);
  assert.equal(fixture.nodes.get('unity-canvas').width, 320);
  assert.equal(fixture.nodes.get('unity-canvas').height, 370);
  assert.equal(fixture.requests[1][1].devicePixelRatio, 1);
  assert.equal(fixture.requests[1][1].matchWebGLToCanvasSize, false);
});
test('native toolbar event enters and exits standard fullscreen after Unity is running', async () => {
  const fixture = openWrapper();
  await fixture.settle();
  assert.deepEqual(fixture.requests.map(([kind]) => kind), ['manifest', 'unity']);
  await fixture.toggleFullscreen();
  assert.equal(fixture.document.fullscreenElement, fixture.nodes.get('stage'));
  assert.equal(fixture.nodes.get('unity-canvas').width, 1600);
  assert.equal(fixture.nodes.get('unity-canvas').height, 762);
  await fixture.toggleFullscreen();
  assert.equal(fixture.document.fullscreenElement, null);
  assert.deepEqual(fixture.transitions, ['enter:standard', 'exit:standard']);
  assert.equal(fixture.nodes.get('unity-canvas').width, 320);
  assert.equal(fixture.nodes.get('unity-canvas').height, 370);
});
test('native toolbar event also toggles WebKit fullscreen and resizes on both changes', async () => {
  const fixture = openWrapper({ fullscreen: 'webkit' });
  await fixture.settle();
  await fixture.toggleFullscreen();
  assert.equal(fixture.document.webkitFullscreenElement, fixture.nodes.get('stage'));
  assert.equal(fixture.nodes.get('unity-canvas').width, 1600);
  await fixture.toggleFullscreen();
  assert.equal(fixture.document.webkitFullscreenElement, null);
  assert.deepEqual(fixture.transitions, ['enter:webkit', 'exit:webkit']);
  assert.equal(fixture.nodes.get('unity-canvas').width, 320);
});
test('fullscreen is ignored while the build is still loading', async () => {
  const fixture = openWrapper({ holdBuild: true });
  assert.deepEqual(fixture.requests.map(([kind]) => kind), ['manifest']);
  await fixture.toggleFullscreen();
  assert.deepEqual(fixture.transitions, []);
  fixture.finishBuild();
  await fixture.settle();
  await fixture.toggleFullscreen();
  assert.deepEqual(fixture.transitions, ['enter:standard']);
});
test('an unavailable fullscreen API produces a visible runtime message', async () => {
  const fixture = openWrapper({ fullscreen: 'none' });
  await fixture.settle();
  await fixture.toggleFullscreen();
  assert.equal(fixture.nodes.get('runtime-message').hidden, false);
  assert.match(fixture.nodes.get('runtime-message').textContent, /Fullscreen is unavailable/i);
});
test('browser fullscreen rejection produces a visible runtime message', async () => {
  const fixture = openWrapper({ rejectFullscreen: true });
  await fixture.settle();
  await fixture.toggleFullscreen();
  assert.equal(fixture.nodes.get('runtime-message').hidden, false);
  assert.match(fixture.nodes.get('runtime-message').textContent, /Fullscreen could not/i);
});
test('Retry recovers from a failed automatic build load without a second successful instance', async () => {
  const fixture = openWrapper({ failFirstBuild: true });
  await fixture.settle();
  assert.equal(fixture.nodes.get('error-panel').hidden, false);
  assert.match(fixture.nodes.get('error-message').textContent, /unavailable.*503/i);
  assert.deepEqual(fixture.requests.map(([kind]) => kind), ['manifest']);
  await fixture.toggleFullscreen();
  assert.deepEqual(fixture.transitions, []);
  await fixture.retry();
  assert.equal(fixture.nodes.get('error-panel').hidden, true);
  assert.equal(fixture.nodes.get('unity-canvas').hidden, false);
  assert.deepEqual(fixture.requests.map(([kind]) => kind), ['manifest', 'manifest', 'unity']);
  await fixture.retry();
  assert.deepEqual(fixture.requests.map(([kind]) => kind), ['manifest', 'manifest', 'unity']);
});
