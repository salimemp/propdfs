// Cloudflare Turnstile bridge for the Flutter web app.
//
// The official Turnstile widget is a <script> that injects an
// <iframe> into a container element. There's no Flutter SDK
// for it; the canonical pattern is to mount a DivElement via
// dart:js_interop and call `turnstile.render()` on it.
//
// We expose two functions on `window`:
//
//   renderTurnstile(containerId, siteKey)
//     Called by the Dart side to mount the widget into the
//     <div id="containerId"> that the Dart widget created.
//     Returns a Promise that resolves when the widget has
//     finished rendering. The widget then calls
//     `window.onTurnstileToken(token)` whenever the user
//     completes the challenge.
//
//   resetTurnstile()
//     Called by the Dart side to request a fresh challenge
//     (e.g. after a 4xx response from the backend).
//
// On non-web platforms this file isn't loaded, so the Dart
// JS interop calls fail gracefully and the widget short-circuits.

(function () {
  if (typeof window === 'undefined') return;

  // Resolved once the script tag below finishes loading.
  let turnstileScriptPromise = null;

  function ensureScriptLoaded() {
    if (turnstileScriptPromise) return turnstileScriptPromise;
    turnstileScriptPromise = new Promise(function (resolve, reject) {
      if (window.turnstile && window.turnstile.render) {
        resolve();
        return;
      }
      var existing = document.querySelector(
        'script[data-turnstile]'
      );
      if (existing) {
        existing.addEventListener('load', function () { resolve(); });
        existing.addEventListener('error', function () {
          reject(new Error('turnstile script failed to load'));
        });
        return;
      }
      var s = document.createElement('script');
      s.src =
        'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true;
      s.defer = true;
      s.dataset.turnstile = '1';
      s.onload = function () { resolve(); };
      s.onerror = function () {
        reject(new Error('turnstile script failed to load'));
      };
      document.head.appendChild(s);
    });
    return turnstileScriptPromise;
  }

  window.renderTurnstile = function (containerId, siteKey) {
    return ensureScriptLoaded().then(function () {
      return new Promise(function (resolve, reject) {
        if (!window.turnstile || !window.turnstile.render) {
          reject(new Error('turnstile not available on window'));
          return;
        }
        var container = document.getElementById(containerId);
        if (!container) {
          reject(new Error('turnstile container not found: ' + containerId));
          return;
        }
        // Avoid double-rendering into the same container.
        if (container.dataset.turnstileRendered === '1') {
          resolve();
          return;
        }
        try {
          window.turnstile.render(container, {
            sitekey: siteKey,
            callback: function (token) {
              if (typeof window.onTurnstileToken === 'function') {
                window.onTurnstileToken(token);
              }
            },
            'error-callback': function () {
              if (typeof window.onTurnstileToken === 'function') {
                window.onTurnstileToken(null);
              }
            },
            'expired-callback': function () {
              // Token expired before submit — fire null so the
              // Dart side can either re-render or block submit.
              if (typeof window.onTurnstileToken === 'function') {
                window.onTurnstileToken(null);
              }
            },
          });
          container.dataset.turnstileRendered = '1';
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  };

  window.resetTurnstile = function () {
    return new Promise(function (resolve) {
      if (!window.turnstile || !window.turnstile.reset) {
        resolve();
        return;
      }
      try {
        window.turnstile.reset();
        resolve();
      } catch (e) {
        resolve();
      }
    });
  };
})();