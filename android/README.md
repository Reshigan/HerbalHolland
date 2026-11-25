# The till on Android (APK)

`android/till` packages the till (`/pos`) as an Android app: a Trusted Web Activity, so it is Chrome running the web
app full screen, without an address bar. Nothing of the till lives here; updating the web app updates every till.

- **Install on a till tablet:** download `https://shop.herbalholland.com/apps/hh-till.apk` on the tablet, allow
  "Install unknown apps" for the browser once, open the file. The app opens `https://shop.herbalholland.com/pos`.
  Chrome must be installed and up to date (it runs the till); without it the app falls back to a basic web view.
- **No address bar:** Android checks `https://shop.herbalholland.com/.well-known/assetlinks.json` (in `public/`) for
  this app's signing-key fingerprint. Until the site is live there, the app shows a slim address bar; it still works.
- **Signing key:** `herbal-holland-till.jks` (alias `till`) and its password are kept by HQ, never in the repository.
  Every update must be signed with the same key, or tablets refuse to update and the fingerprint in assetlinks.json
  stops matching. Keep two copies somewhere safe.
- **Updates, automatically:** the till's content updates with the website. A new APK (only needed when the app
  itself changes) is built, signed and published by `.github/workflows/android-till.yml` on every push to main that
  touches `android/`, or by hand from the Actions tab. It writes `public/apps/hh-till.apk` and `hh-till.json`. From
  APK 2 the app updates itself (`UpdateActivity.java`): each time the till opens it downloads a newer APK in the
  background and installs it the next time the till is opened, before the till starts, so never during a sale. The
  till then closes once; open it again. On Android 12+ only the first update asks (once "Allow from this source", once
  Install); after that updates need no taps. Android 11 asks for one tap each time. Tills still on APK 1 show an
  "Update" bar (`src/components/pos/app-update.tsx`) to get there. The workflow needs two repository secrets
  (Settings → Secrets and variables → Actions): `TILL_KEYSTORE_B64` (the key file, base64:
  `base64 -w0 herbal-holland-till.jks`) and `TILL_KEYSTORE_PASSWORD`.
- **Build** (JDK 17+, Android SDK with platform 35 and build-tools 35, Gradle 8.14):

  ```bash
  cd android/till
  ANDROID_HOME=/path/to/sdk TILL_KEYSTORE=/secure/herbal-holland-till.jks TILL_KEYSTORE_PASSWORD=… gradle assembleRelease
  # → app/build/outputs/apk/release/app-release.apk; copy it to public/apps/hh-till.apk
  ```

  Raise `versionCode` (and `versionName`) in `app/build.gradle` for each new APK. For a test server:
  `gradle assembleRelease -Phost=staging.example.com`.
- **Card payments:** Halo Dot tap-on-glass opens the Halo app from the till page as it does in Chrome; nothing extra.

## Herbal Holland Rewards (`shop/`, Google Play)

A Trusted Web Activity like the till, for members: Rewards card, referral credit, stores and learn. Google Play does
not allow cannabis sales, so this build is Rewards only. It opens `/api/app?src=play`, which sets the `hh_play`
cookie; while that cookie is present the proxy sends the shop, basket, checkout, drops, specials, gift and order
pages to `/club`. The full shop stays the installed web app (PWA) in the browser.

- **Signing key:** `herbal-holland-shop-upload.jks` (alias `upload`) is the Play upload key, kept by HQ, never in the
  repository. Play App Signing holds the app key: add both fingerprints to `/.well-known/assetlinks.json`.
- **Build** (same tools as the till):

  ```bash
  cd android/shop
  ANDROID_HOME=/path/to/sdk SHOP_KEYSTORE=/secure/herbal-holland-shop-upload.jks SHOP_KEYSTORE_PASSWORD=… gradle bundleRelease
  # → app/build/outputs/bundle/release/app-release.aab; upload it in Play Console
  ```

  Raise `versionCode` for each upload (`-PversionCode=2 -PversionName=1.0.1`).
- **After the listing is live:** set `PLAY_STORE_URL` (the listing link) in the Worker's vars. Android members who
  join in the browser are then sent to the Play listing instead of the install page.

The till and the back office install on iPads from Safari (Share → Add to Home Screen) and open full screen with
their own icons.
