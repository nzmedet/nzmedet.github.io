import test from 'node:test';
import assert from 'node:assert/strict';
import { isHandheld, canvasResolution, createLaunchController } from '../playground-core.mjs';

// Missing a mobile branch would expose the heavy Unity download to handheld devices.
const devices = [
  ['iPhone', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 }, true],
  ['iPad mobile UA', { userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', platform: 'iPad', maxTouchPoints: 5 }, true],
  ['iPad desktop UA', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 }, true],
  ['Android phone', { userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/135.0 Mobile Safari/537.36', platform: 'Linux armv8l', maxTouchPoints: 5 }, true],
  ['Android tablet without Mobile token', { userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X610) AppleWebKit/537.36 Chrome/135.0 Safari/537.36', maxTouchPoints: 5 }, true],
  ['browser mobile hint', { userAgent: 'Unknown', userAgentData: { mobile: true }, maxTouchPoints: 1 }, true],
  ['Mac desktop', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 0 }, false],
  ['Windows touch laptop', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0 Safari/537.36', platform: 'Win32', maxTouchPoints: 10 }, false],
  ['Android desktop UA platform hint', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/135.0 Safari/537.36', userAgentData: { mobile: false, platform: 'Android' }, maxTouchPoints: 5 }, true],
];
for (const [name, navigator, want] of devices) {
  test(`device gate classifies ${name}`, () => assert.equal(isHandheld(navigator), want));
}

// Changing the render scale or dropping the cap would overallocate the backing buffer.
test('retina canvas caps DPR at one', () => {
  assert.deepEqual(canvasResolution(1200, 675, 2), { width: 1200, height: 675 });
});
test('large canvas caps its long edge at 1600 while preserving aspect', () => {
  assert.deepEqual(canvasResolution(2560, 1440, 2), { width: 1600, height: 900 });
});
test('narrow desktop canvas remains available', () => {
  assert.deepEqual(canvasResolution(320, 180, 1), { width: 320, height: 180 });
});

// These external boundaries would download the build and run Unity in a real browser.
for (const [name, navigator, mobile] of devices.filter((d) => d[2])) {
  test(`${name} cannot fetch a manifest or load Unity, even if start is called`, async () => {
    const requests = [];
    const controller = createLaunchController({
      navigator,
      loadBuild: async () => { requests.push('manifest'); return {}; },
      runUnity: async () => { requests.push('loader'); return {}; },
    });
    assert.equal(controller.state.status, 'blocked');
    await controller.start();
    assert.deepEqual(requests, []);
    assert.equal(controller.state.status, 'blocked');
  });
}
test('desktop waits for Start before fetching a build', async () => {
  const requests = [];
  const controller = createLaunchController({
    navigator: devices[6][1],
    loadBuild: async () => { requests.push('manifest'); return { productName: 'Black Hole Playground' }; },
    runUnity: async () => { requests.push('loader'); return { SetFullscreen() {} }; },
  });
  assert.equal(controller.state.status, 'idle');
  assert.deepEqual(requests, []);
  await controller.start();
  assert.deepEqual(requests, ['manifest', 'loader']);
  assert.equal(controller.state.status, 'running');
});
test('repeated Start while loading starts one Unity instance', async () => {
  let finish;
  let calls = 0;
  const build = new Promise((resolve) => { finish = resolve; });
  const controller = createLaunchController({
    navigator: devices[6][1], loadBuild: () => build,
    runUnity: async () => { calls++; return {}; },
  });
  const a = controller.start();
  const b = controller.start();
  finish({});
  await Promise.all([a, b]);
  assert.equal(calls, 1);
  assert.equal(controller.state.status, 'running');
});
test('Unity progress updates the observable loading state', async () => {
  const states = [];
  const controller = createLaunchController({
    navigator: devices[6][1],
    onChange: (state) => states.push({ ...state }),
    loadBuild: async () => ({}),
    runUnity: async (_, progress) => { progress(0.42); return {}; },
  });
  await controller.start();
  assert.ok(states.some((state) => state.status === 'loading' && state.progress === 0.42));
  assert.equal(controller.state.progress, 1);
});
test('a failed build presents an error and allows a fresh retry', async () => {
  let attempts = 0;
  const controller = createLaunchController({
    navigator: devices[6][1],
    loadBuild: async () => { if (++attempts === 1) throw new Error('Build files are unavailable.'); return {}; },
    runUnity: async () => ({}),
  });
  await controller.start();
  assert.equal(controller.state.status, 'error');
  assert.match(controller.state.error, /Build files are unavailable/);
  await controller.start();
  assert.equal(controller.state.status, 'running');
  assert.equal(attempts, 2);
});
