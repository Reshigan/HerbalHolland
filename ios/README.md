# Herbal Holland for iPhone (App Store)

`ios/` is a small native shell around the shop and Rewards web app (`https://shop.herbalholland.com/club`). Everything
the customer sees is the web app, so a website deploy updates the app. The shell only adds what a browser tab cannot:

- the installed-app layout. A script marks `<html>` with `native-app` and sets `navigator.standalone`, so the web app
  shows its own tab bar (the `app:` variant in `src/app/globals.css`) and treats the page as the installed app;
- pull to refresh, swipe back and forward, and an offline screen with "Try again";
- links to other sites, `tel:`, `mailto:` and WhatsApp open outside the app. Payment redirects stay inside it;
- universal links, once `apple-app-site-association` lists the app (see below).

## Build

Requires Xcode 26+ and xcodegen (`brew install xcodegen`). `project.yml` is the source; the `.xcodeproj` and
`Info.plist` are generated and not committed.

```bash
cd ios
xcodegen
open HerbalHolland.xcodeproj          # or, for the simulator without signing:
xcodebuild -project HerbalHolland.xcodeproj -scheme HerbalHolland -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
```

## Before the first App Store upload

1. Enrol in the Apple Developer Program (USD 99 a year) as the company, so the seller name is Herbal Holland.
2. Put the Team ID in `DEVELOPMENT_TEAM` in `project.yml`, run `xcodegen`, then Product → Archive → Distribute App.
3. Raise `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` for each upload. Content changes need no new build.
4. Universal links (optional): add `public/.well-known/apple-app-site-association` with
   `{"applinks":{"details":[{"appIDs":["<TEAMID>.com.herbalholland.app"],"components":[{"/":"/club*"},{"/":"/shop*"},{"/":"/p/*"}]}]}}`
   and an `com.apple.developer.associated-domains` entitlement `applinks:shop.herbalholland.com`.
5. Push notifications need an APNs key and native registration. The web push in the shop does not run inside this app.

App review: Apple rejects apps that are "just a website" (guideline 4.2) and restricts cannabis products (1.4.3, 5.3).
The review notes should explain the Rewards card, member pricing, orders and store finder, and that no cannabis is sold
in the app.

The icon is `HerbalHolland/Assets.xcassets/AppIcon.appiconset/icon-1024.png` (1024×1024, no transparency).
