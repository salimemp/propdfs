# ProPDFs Cookie Policy

**Effective Date:** January 1, 2026
**Last Updated:** January 1, 2026

This Cookie Policy explains how ProPDFs ("we," "our," or "us") uses cookies and similar technologies when you visit propdfs.com, our mobile applications, or otherwise interact with our services. It supplements our [Privacy Policy](./PRIVACY_POLICY.md) and applies to all visitors, regardless of whether they have an account.

## 1. What are cookies?

Cookies are small text files stored on your device by your browser when you visit a website. They are widely used to make sites work, improve performance, and provide information to the site operators. We use cookies **and** similar technologies (localStorage, IndexedDB, sessionStorage) for the purposes described below.

## 2. Categories of cookies we use

We follow the categorisation model recommended by the European Data Protection Board (EDPB) and the ePrivacy Directive (2002/58/EC, as amended). When you first visit our site we show you a consent banner that lets you opt in or out of every category except strictly necessary cookies.

### 2.1 Strictly necessary cookies

These cookies are essential for the site to function. They include session tokens, CSRF tokens, and authentication cookies. Without them you cannot sign in, upload files, or use the PDF tools. The legal basis for these is our **legitimate interest** in providing a working service — they are not optional and we do not require consent to set them (per Article 5(3) of the ePrivacy Directive).

| Cookie | Purpose | Lifetime |
|---|---|---|
| `access_token` | JWT for the current session | 15 min (refresh-token rotation) |
| `refresh_token` | Long-lived session resume | 30 days, rotated on every refresh |
| `cookie_consent` | Your saved cookie preferences | 12 months (so we don't re-ask on every visit) |
| `csrf_token` | Cross-site request forgery guard | Session |
| `i18n_lang` | Selected language | 12 months |
| `theme_mode` | Light / dark theme preference | 12 months |

### 2.2 Preference cookies (functional)

These remember your choices — theme (light / dark), language, accessibility settings, the last tool you used. They make your repeat visits more pleasant. You can clear them from your browser at any time and the site will fall back to defaults. The legal basis is **consent**, which you can withdraw at any time via the cookie banner or your browser settings.

| Cookie | Purpose | Lifetime |
|---|---|---|
| `last_used_tool` | Highlight the most recent tool on the home screen | 30 days |
| `accessibility_*` | Screen-reader verbosity, reduced-motion, font size | 12 months |
| `dashboard_layout` | Saved widget arrangement on the documents screen | 12 months |

### 2.3 Analytics cookies

We use **Plausible Analytics**, a privacy-friendly service that does not set cross-site tracking cookies. Plausible collects anonymised, aggregated page-view counts with **no per-user identifiers** and **no IP storage**. The data is co-tenanted in the EU (Frankfurt region). We never sell or share analytics data with third parties.

| Provider | Purpose | Region | Data shared |
|---|---|---|---|
| Plausible Analytics | Aggregated page-view counts | EU (Frankfurt) | URL path, referrer hostname, browser, viewport — all anonymous |

The legal basis is **consent**. You can opt out via the cookie banner. Plausible also respects the `Do Not Track` and `Sec-GPC` browser signals without configuration.

### 2.4 Advertising cookies

**We do not use advertising cookies.** No Facebook / Google ad-network pixels, no cross-site tracking, no remarketing tags. We do not embed third-party ad-tech on propdfs.com or in the mobile apps.

If we ever introduce advertising, this section will be updated and existing users will be prompted to re-confirm their preferences before any non-essential ad-tech is loaded.

## 3. Cookies we do NOT use

For transparency, here is a list of cookies our site will **never** set, regardless of consent:

- ❌ Third-party advertising cookies
- ❌ Facebook / Meta Pixel
- ❌ Google Ads conversion tracking
- ❌ LinkedIn Insights, Twitter Pixel, TikTok Pixel
- ❌ Cross-site session-replay scripts (FullStory, LogRocket, Hotjar)
- ❌ Cross-site tracking from any source

## 4. How to control cookies

You have several ways to manage cookies on ProPDFs.

### 4.1 In-product controls

- The consent banner shown on your first visit lets you accept all, accept essential only, or customise preferences.
- After consenting, you can re-open the banner by clicking **Settings → Privacy → Manage cookie preferences** on the dashboard.
- The Settings → Privacy screen also has a per-category toggle so you can adjust granularly.

### 4.2 Browser controls

You can also block or delete cookies in your browser settings. Common paths:

- **Chrome**: Settings → Privacy and security → Cookies and other site data
- **Safari**: Preferences → Privacy → Manage Website Data
- **Firefox**: Preferences → Privacy & Security → Cookies and Site Data
- **Edge**: Settings → Cookies and site permissions → Cookies and site data

Blocking strictly necessary cookies will sign you out and break core functionality. The site may continue to load but the PDF tools and authentication will not work.

### 4.3 Mobile app controls

Our iOS and Android apps store consent in the app's sandboxed preferences. Clearing the app's data (or uninstalling and reinstalling) resets the consent state and we will re-ask on next launch.

## 5. International transfers

Because Plausible Analytics is hosted in the EU, analytics data does not leave the European Economic Area. Authentication cookies are scoped to your browser's domain (`propdfs.com`) and never shared with third parties. The only cross-border transfer we perform is the document content you choose to upload to our processing infrastructure — see our [Privacy Policy](./PRIVACY_POLICY.md) §6 for details.

## 6. Changes to this policy

We may update this Cookie Policy from time to time. Material changes (such as adding a new cookie category) will be announced via:

- A banner on the site for all visitors
- An in-product notice for signed-in users
- A dated entry in the changelog below

The "Last Updated" date at the top of this page reflects the current version.

### Changelog

| Date | Change |
|---|---|
| 2026-01-01 | Initial publication |

## 7. Contact

Questions about cookies? Email **privacy@propdfs.com**. We respond within 5 business days.

For data-subject requests under GDPR (right to access, erasure, restriction, portability) or CCPA (right to know, delete, opt-out), see our [Privacy Policy](./PRIVACY_POLICY.md) §7.

---

ProPDFs is operated by ProPDFs Inc. This Cookie Policy is compliant with the ePrivacy Directive (2002/58/EC), the GDPR (Regulation (EU) 2016/679), and the California Consumer Privacy Act (CCPA).
