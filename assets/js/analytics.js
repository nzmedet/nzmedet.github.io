(() => {
  'use strict';
  const measurementId = 'G-D6L9JQQSBH';
  const choiceKey = 'tsx-analytics-choice';
  const sixMonths = 180 * 24 * 60 * 60;
  let initialized = false;
  let previousFocus;
  let choice = readChoice();
  let automatic = false;
  const browserOptOut = navigator.globalPrivacyControl === true ||
    navigator.doNotTrack === '1' || window.doNotTrack === '1';
  const optInCountries = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB UK CH AX GF GP MQ RE MF YT GG JE IM GI EU'.split(' '));

  async function detectAutomaticMode() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    try {
      // Country only: never store the response's IP or other diagnostic fields.
      const response = await fetch('https://www.cloudflare.com/cdn-cgi/trace', {
        credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) return false;
      const match = (await response.text()).match(/^loc=([A-Z]{2})$/m);
      if (!match || ['XX', 'ZZ', 'XA', 'XB'].includes(match[1])) return false;
      const country = match[1];
      const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(country);
      return name !== country && !optInCountries.has(country);
    } catch (_) {
      return false; // No reliable location means explicit acceptance is required.
    } finally {
      clearTimeout(timeout);
    }
  }

  function readChoice() {
    try {
      const saved = JSON.parse(localStorage.getItem(choiceKey));
      if (saved && saved.expires > Date.now() && ['granted', 'denied'].includes(saved.choice)) return saved.choice;
    } catch (_) { /* Storage can be unavailable in private or restricted browsers. */ }
    return null;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  const denied = { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
  window.gtag('consent', 'default', denied);

  function removeAnalyticsCookies() {
    document.cookie.split(';').forEach(cookie => {
      const name = cookie.trim().split('=')[0];
      if (!/^_ga(?:_|$)/.test(name)) return;
      const expired = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
      document.cookie = expired;
      document.cookie = `${expired}; Domain=${location.hostname}`;
      document.cookie = `${expired}; Domain=.${location.hostname}`;
    });
  }

  function applyChoice(choice) {
    const allowed = !browserOptOut && (choice === 'granted' || (!choice && automatic));
    window[`ga-disable-${measurementId}`] = !allowed;
    if (!allowed) {
      if (initialized) window.gtag('consent', 'update', denied);
      removeAnalyticsCookies();
      return;
    }
    window.gtag('consent', 'update', { ...denied, analytics_storage: 'granted' });
    if (initialized) return;
    initialized = true;
    window.gtag('js', new Date());
    window.gtag('config', measurementId, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_domain: 'none',
      cookie_expires: sixMonths,
      cookie_update: false
    });
    // Load Google only after an explicit choice or a resolved default-on region.
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(tag);
  }

  const styles = document.createElement('link');
  styles.rel = 'stylesheet';
  styles.href = '/assets/css/analytics.css?v=2';
  document.head.appendChild(styles);

  const panel = document.createElement('section');
  panel.id = 'tsx-analytics-consent';
  panel.setAttribute('aria-label', 'Website analytics');
  panel.hidden = true;
  panel.innerHTML = '<p>Allow Google Analytics cookies for visits and store-link clicks? Off until you accept. <a href="/privacy.html">Privacy</a></p>' +
    '<div class="tsx-consent-actions"><button type="button" data-choice="denied">Decline</button>' +
    '<button type="button" data-choice="granted">Accept analytics</button></div>';
  document.body.appendChild(panel);

  const controls = document.createElement('div');
  controls.id = 'tsx-privacy-controls';
  controls.innerHTML = '<a href="/privacy.html">Website privacy</a><button type="button" aria-controls="tsx-analytics-consent" aria-expanded="false">Analytics preferences</button>';
  document.body.appendChild(controls);
  const preferences = controls.querySelector('button');

  function updatePanel() {
    const paragraph = panel.querySelector('p');
    const decline = panel.querySelector('[data-choice="denied"]');
    const accept = panel.querySelector('[data-choice="granted"]');
    const isOn = !browserOptOut && (choice === 'granted' || (!choice && automatic));
    const message = browserOptOut
      ? 'Your browser privacy setting keeps analytics off.'
      : isOn
        ? 'Google Analytics cookies are on for visits and store-link clicks. You can turn them off.'
        : 'Allow Google Analytics cookies for visits and store-link clicks? Off until you accept.';
    paragraph.innerHTML = `${message} <a href="/privacy.html">Privacy</a>`;
    decline.textContent = browserOptOut ? 'Close' : isOn ? 'Turn off' : 'Decline';
    accept.textContent = isOn ? 'Keep enabled' : 'Accept analytics';
    accept.disabled = browserOptOut;
  }

  function showPanel(focus) {
    updatePanel();
    panel.hidden = false;
    preferences.setAttribute('aria-expanded', 'true');
    if (focus) {
      previousFocus = document.activeElement;
      panel.querySelector('button').focus({ preventScroll: true });
    }
  }
  function hidePanel() {
    const needsFocus = panel.contains(document.activeElement);
    panel.hidden = true;
    preferences.setAttribute('aria-expanded', 'false');
    if (needsFocus) {
      const target = previousFocus || document.querySelector('main') || document.body;
      if (!previousFocus && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  }

  preferences.addEventListener('click', () => showPanel(true));
  panel.addEventListener('click', event => {
    const button = event.target.closest('button[data-choice]');
    if (!button) return;
    choice = button.dataset.choice;
    try { localStorage.setItem(choiceKey, JSON.stringify({ choice, expires: Date.now() + sixMonths * 1000 })); } catch (_) { /* Honour the choice for this page even if it cannot be saved. */ }
    applyChoice(choice);
    hidePanel();
  });
  window.addEventListener('storage', event => {
    if (event.key !== choiceKey && event.key !== null) return;
    choice = readChoice();
    updatePanel();
    applyChoice(choice);
    if (choice) hidePanel(); else showPanel(false);
  });
  window[`ga-disable-${measurementId}`] = true;
  if (choice || browserOptOut) applyChoice(choice);
  if (!choice && !browserOptOut) {
    detectAutomaticMode().then(result => {
      automatic = result;
      applyChoice(choice); // Re-read current state: the visitor may have acted while waiting.
      if (!choice) showPanel(false);
    });
  }
})();
