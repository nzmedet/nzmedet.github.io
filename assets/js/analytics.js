(() => {
  'use strict';
  const measurementId = 'G-D6L9JQQSBH';
  const choiceKey = 'tsx-analytics-choice';
  const sixMonths = 180 * 24 * 60 * 60;
  let initialized = false;
  let previousFocus;

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
    const allowed = choice === 'granted';
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
    // Basic consent mode: Google's script is requested only after acceptance.
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(tag);
  }

  const styles = document.createElement('link');
  styles.rel = 'stylesheet';
  styles.href = '/assets/css/analytics.css?v=1';
  document.head.appendChild(styles);

  const panel = document.createElement('section');
  panel.id = 'tsx-analytics-consent';
  panel.setAttribute('aria-labelledby', 'tsx-analytics-title');
  panel.hidden = true;
  panel.innerHTML = '<h2 id="tsx-analytics-title">Help us improve tsx.nz</h2>' +
    '<p>May we use Google Analytics cookies to understand page visits and store-link clicks? Optional analytics stays off unless you accept.</p>' +
    '<a href="/privacy.html">Website privacy</a>' +
    '<div class="tsx-consent-actions"><button type="button" data-choice="denied">Decline</button>' +
    '<button type="button" data-choice="granted">Accept analytics</button></div>';
  document.body.appendChild(panel);

  const controls = document.createElement('div');
  controls.id = 'tsx-privacy-controls';
  controls.innerHTML = '<a href="/privacy.html">Website privacy</a><button type="button" aria-controls="tsx-analytics-consent" aria-expanded="false">Analytics preferences</button>';
  document.body.appendChild(controls);
  const preferences = controls.querySelector('button');

  function showPanel(focus) {
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
    const choice = button.dataset.choice;
    try { localStorage.setItem(choiceKey, JSON.stringify({ choice, expires: Date.now() + sixMonths * 1000 })); } catch (_) { /* Honour the choice for this page even if it cannot be saved. */ }
    applyChoice(choice);
    hidePanel();
  });
  window.addEventListener('storage', event => {
    if (event.key !== choiceKey && event.key !== null) return;
    const choice = readChoice();
    applyChoice(choice);
    if (choice) hidePanel(); else showPanel(false);
  });
  const choice = readChoice();
  applyChoice(choice);
  if (!choice) showPanel(false);
})();
