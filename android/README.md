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
  touches `android/`, or by hand from the Actions tab. It writes `public/apps/hh-till.apk` and `hh-till.json`; tills
  on an older APK then show an "Update" bar: one tap downloads it, one installs it. Fully silent installs need device
  management (Android Enterprise / an MDM) or Google Play. The workflow needs two repository secrets (Settings →
  Secrets and variables → Actions): `TILL_KEYSTORE_B64` (the key file, base64: `base64 -w0 herbal-holland-till.jks`)
  and `TILL_KEYSTORE_PASSWORD`.
- **Build** (JDK 17+, Android SDK with platform 35 and build-tools 35, Gradle 8.14):

  ```bash
  cd android/till
  ANDROID_HOME=/path/to/sdk TILL_KEYSTORE=/secure/herbal-holland-till.jks TILL_KEYSTORE_PASSWORD=… gradle assembleRelease
  # → app/build/outputs/apk/release/app-release.apk; copy it to public/apps/hh-till.apk
  ```

  Raise `versionCode` (and `versionName`) in `app/build.gradle` for each new APK. For a test server:
  `gradle assembleRelease -Phost=staging.example.com`.
- **Card payments:** Halo Dot tap-on-glass opens the Halo app from the till page as it does in Chrome; nothing extra.

## The shop and Rewards app (Google Play)

`android/shop` packages the customer web app (`/club`, with the shop, drops, stores and orders) as `com.herbalholland.app`
for Google Play, the same way: a Trusted Web Activity, so website deploys update it. Staff pages (`/pos`, `/store`, `/hq`)
are not handled by it and open in the browser.

- **Upload key:** `herbal-holland-shop-upload.jks` (alias `upload`), kept by HQ, never in the repository. On the HQ Mac it
  is `~/Secure/herbal-holland/herbal-holland-shop-upload.jks`, with its password in the Keychain under service
  `herbal-holland-shop-upload-key` (`security find-generic-password -a upload -s herbal-holland-shop-upload-key -w`).
  Google Play re-signs the app with its own key (Play App Signing). If the upload key is lost, Play can reset it.
- **Build:**

  ```bash
  cd android/shop
  SHOP_KEYSTORE=~/Secure/herbal-holland/herbal-holland-shop-upload.jks \
  SHOP_KEYSTORE_PASSWORD="$(security find-generic-password -a upload -s herbal-holland-shop-upload-key -w)" \
  gradle bundleRelease -PversionCode=1 -PversionName=1.0.0
  # → app/build/outputs/bundle/release/app-release.aab: upload this to Play Console
  ```

  Each upload needs a higher `versionCode`.
- **No address bar:** after the first upload, copy the "App signing key certificate" SHA-256 from Play Console
  (Test and release → App integrity) into the `com.herbalholland.app` entry of `public/.well-known/assetlinks.json`, next
  to the upload-key fingerprint already there, and deploy. Until then the Play version shows a slim address bar.
- **Play policy:** Google Play does not allow apps that sell or facilitate the sale of cannabis. The store listing and
  the app must not offer cannabis products for sale.

On iPhone the shop and Rewards app is in `ios/` (App Store). The till and the back office install from Safari
(Share → Add to Home Screen) and open full screen with their own icons.
