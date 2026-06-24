# ProPDFs deep-link config

This directory holds the static files that the iOS and Android
operating systems fetch from `https://propdfs.com/.well-known/`
to enable Universal Links (iOS) and App Links (Android).

## Files

| File | OS | What it does |
|---|---|---|
| `apple-app-site-association` | iOS | Maps propdfs.com paths to the iOS app bundle ID. Tells iOS to open the app instead of the browser for matched paths. |
| `assetlinks.json` | Android | Maps propdfs.com paths to the Android package name + signing-cert SHA-256. Tells Android to open the app instead of the browser. |

## Placeholders to update before the mobile apps ship

`apple-app-site-association`:
- `appIDs`: replace `ABCDE12345` with your Apple Developer Team ID.
- `ABCDE12345.com.propdfs.app`: replace the full string with
  `<TEAM_ID>.<YOUR_BUNDLE_ID>`. Your bundle ID lives in
  Xcode → Signing & Capabilities → Bundle Identifier.

`assetlinks.json`:
- `package_name`: replace `com.propdfs.app` with your real
  Android application ID (Gradle `applicationId`).
- `sha256_cert_fingerprints`: replace
  `REPLACE_WITH_YOUR_RELEASE_SHA256_FINGERPRINT` with the
  SHA-256 of the **release** signing cert. The Play Store
  uploaded cert is what the OS verifies against.

  Quick way to get it:
  ```bash
  keytool -list -v -keystore ~/path/to/release.keystore \
    -alias <your-key-alias>
  # Look for "SHA256 fingerprint" in the output
  ```

  Add both the upload-key fingerprint (for Play Store installs)
  and the debug-key fingerprint (for local development) — the
  OS accepts a match on any of them.

## What paths get opened in the app

Both files currently match:

- `/tools/*` — every tool page (merge, split, compress, etc.)
- `/blog/*` — every blog article
- `/home`, `/pricing`, `/about`, `/compare`
- `/documents` — the user's document list

Anything not in the list falls through to the SPA and the
browser handles it.

## Verifying

Once the apps are installed + the files are updated:

- iOS: open a matched URL in Notes, long-press, "Open in <App>".
  If that option is missing, run
  `sudo killall -HUP mDNSResponder` to flush the iOS cache,
  then retry.
- Android: run
  `adb shell pm verify-app-links --re-verify com.propdfs.app`
  to force re-verification.
