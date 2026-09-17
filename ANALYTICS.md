# tsx.nz website analytics

Configured 17 September 2026 using standard (free) Google Analytics 4.

- Account: Default Account for Firebase, 185446868, owned via evolcoder@gmail.com.
- Property: tsx.nz, 554699560.
- Web stream: tsx.nz website, 15792421522, https://tsx.nz.
- Public measurement ID: G-D6L9JQQSBH.
- Dashboard: https://analytics.google.com/analytics/web/#/a185446868p554699560/reports/intelligenthome
- Reporting: New Zealand time, NZD.
- User and event data retention: 14 months; reset on new activity disabled. Google applies retention changes after 24 hours. Most aggregate reports are unaffected by event retention.

## Coverage and consent

All 11 HTML pages at the apex site load `/assets/js/analytics.js`. This does not add tracking to separately hosted subdomains or mobile apps. The previous Cloudflare beacon has been removed from the homepage.

The Google script loads only after acceptance. Decline blocks initialization. Visitors can reopen Analytics preferences at the bottom of every page. Choices expire after 180 days; unavailable browser storage limits a choice to the current page. Analytics cookies use the apex host only, with a 180-day expiry. Withdrawal disables new collection and removes these cookies. Previously collected events may already be queued or stored by Google.

The tag denies advertising storage, advertising user data and advertising personalisation; Google signals and advertising personalisation signals are disabled. Website privacy details are in `/privacy.html`; app policies link to them separately from their app disclosures.

## Reading results

- Pages and screens: page views and engagement; filter the page path to `/gargantua/` for Gargantua.
- Traffic acquisition: sources and campaigns that brought visitors to the website.
- Events / Explore: enhanced measurement sends `click` for outbound links. Filter `Link domain` to `apps.apple.com` or `play.google.com`, and use `Link URL` to distinguish apps. These are clicks, not installs or purchases.
- Enhanced measurement also includes scrolls (90% depth) and other supported interactions. The local HTML video is not a YouTube video, so automatic YouTube engagement tracking does not measure it.
- Browser blocking and declined consent reduce coverage. Data collection starts with this installation; Cloudflare history is not imported.
- The planned YouTube ad opens the App Store directly, so those visits bypass this website. Google Ads and Apple campaign reporting remain separate. No campaign launch, paid upgrade, conversion import, or in-app SDK is part of this migration.

## Verification

With Node and Playwright available, run `node tests/analytics.cjs`. The tests serve the real site locally and intercept outside requests so automated test visits do not enter Analytics. They check no tag before acceptance, persistence, single initialization, ad settings, withdrawal/cookie removal, expiry, unavailable storage, and focus/scroll behavior.

An integration check with the actual Google script emitted `page_view` and `click` with `link_domain=apps.apple.com`; collection requests were intercepted locally. Recheck the deployed site and Realtime after publishing. Standard reports can lag behind Realtime.
