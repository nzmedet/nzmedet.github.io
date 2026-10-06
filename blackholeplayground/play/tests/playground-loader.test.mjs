import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchBuild, instantiateUnity } from '../playground-loader.mjs';

const manifest = {
  loaderUrl: 'Build/Playground.loader.js', dataUrl: 'Build/Playground.data.unityweb',
  frameworkUrl: 'Build/Playground.framework.js.unityweb', codeUrl: 'Build/Playground.wasm.unityweb',
  productName: 'Black Hole Playground', productVersion: '1.2',
};
const base = 'http://localhost:8765/blackholeplayground/play/unity-build.json';

test('build manifest resolves files relative to its own URL', async () => {
  const config = await fetchBuild(async () => ({ ok: true, json: async () => manifest }), base);
  assert.equal(config.loaderUrl, 'http://localhost:8765/blackholeplayground/play/Build/Playground.loader.js');
  assert.equal(config.codeUrl, 'http://localhost:8765/blackholeplayground/play/Build/Playground.wasm.unityweb');
});
test('missing manifest gives a readable build error', async () => {
  await assert.rejects(fetchBuild(async () => ({ ok: false, status: 404 }), base), /unavailable.*404/i);
});
test('incomplete manifest is rejected before any loader can run', async () => {
  await assert.rejects(fetchBuild(async () => ({ ok: true, json: async () => ({ loaderUrl: manifest.loaderUrl }) }), base), /dataUrl/);
});
test('manifest cannot direct the build to a different origin', async () => {
  await assert.rejects(fetchBuild(async () => ({ ok: true, json: async () => ({ ...manifest, codeUrl: 'https://elsewhere.invalid/build.wasm' }) }), base), /same website/i);
});

test('loader creates Unity with bounded canvas settings and forwards progress', async () => {
  const requests = [];
  const progress = [];
  const canvas = {};
  const instance = {};
  const window = {};
  let received;
  const document = {
    createElement: () => ({}),
    head: { append(script) {
      requests.push(script.src);
      window.createUnityInstance = async (actualCanvas, config, report) => {
        assert.equal(actualCanvas, canvas); received = config; report(0.6); return instance;
      };
      queueMicrotask(() => script.onload());
    } },
  };
  const result = await instantiateUnity({ document, window, canvas, config: manifest, onProgress: (p) => progress.push(p) });
  assert.equal(result, instance);
  assert.deepEqual(requests, ['Build/Playground.loader.js']);
  assert.deepEqual(progress, [0.6]);
  assert.equal(received.devicePixelRatio, 1);
  assert.equal(received.matchWebGLToCanvasSize, false);
  assert.equal(received.codeUrl, manifest.codeUrl);
});
test('network failure on the loader becomes a clear launch error', async () => {
  const document = { createElement: () => ({ remove() {} }), head: { append(script) { queueMicrotask(() => script.onerror()); } } };
  await assert.rejects(instantiateUnity({ document, window: {}, canvas: {}, config: manifest }), /loader could not be downloaded/i);
});
test('Unity factory failure reaches the launch controller', async () => {
  await assert.rejects(instantiateUnity({
    document: {}, window: { createUnityInstance: async () => { throw new Error('WebGL initialization failed'); } },
    canvas: {}, config: manifest,
  }), /WebGL initialization failed/);
});
