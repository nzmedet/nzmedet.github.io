export async function fetchBuild(fetcher, manifestUrl) {
  let response;
  try { response = await fetcher(manifestUrl, { cache: 'no-cache' }); }
  catch { throw new Error('The build files could not be reached. Check your connection and try again.'); }
  if (!response.ok) throw new Error(`The build files are unavailable (HTTP ${response.status}). Please try again later.`);
  let manifest;
  try { manifest = await response.json(); }
  catch { throw new Error('The playground build configuration could not be read.'); }
  const config = {
    companyName: 'MEDET TLEUGABYLULY LIMITED', productName: 'Black Hole Playground',
    productVersion: '1.2', streamingAssetsUrl: 'StreamingAssets', ...manifest,
  };
  const base = new URL(manifestUrl);
  for (const key of ['loaderUrl', 'dataUrl', 'frameworkUrl', 'codeUrl', 'streamingAssetsUrl']) {
    if (typeof config[key] !== 'string' || !config[key].trim()) throw new Error(`The build configuration is missing ${key}.`);
    const url = new URL(config[key], base);
    if (url.origin !== base.origin || !/^https?:$/.test(url.protocol)) {
      throw new Error('The playground build files must come from the same website.');
    }
    config[key] = url.href;
  }
  return config;
}

export async function instantiateUnity({ document, window, canvas, config, onProgress = () => {}, onBanner = () => {} }) {
  if (typeof window.createUnityInstance !== 'function') {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => {
        script.remove();
        reject(new Error('The playground loader timed out. Check your connection and try again.'));
      }, 30000);
      script.src = config.loaderUrl;
      script.async = true;
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        reject(new Error('The playground loader could not be downloaded. Please try again.'));
      };
      document.head.append(script);
    });
  }
  if (typeof window.createUnityInstance !== 'function') throw new Error('The playground loader did not initialize. Please reload and try again.');
  const { loaderUrl, ...unityConfig } = config;
  return window.createUnityInstance(canvas, {
    ...unityConfig,
    devicePixelRatio: 1,
    matchWebGLToCanvasSize: false,
    showBanner: onBanner,
  }, onProgress);
}
