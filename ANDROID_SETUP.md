# EV ChargeHub — Android Build

The `android/` folder is ready. Open it in **Android Studio** → let Gradle sync → Run ▶.

## What's inside

- **Package**: `com.evchargehub.app`
- **App name**: EV ChargeHub
- **Mode**: Thin WebView wrapper. The app loads the live site from
  `https://id-preview--179d8fe7-695a-4ce4-ba37-8601e9312e99.lovable.app`
  (configured in `capacitor.config.ts` → `server.url`).

This is a **TanStack Start SSR** app, so it cannot be packaged as a fully offline APK without rewriting it as a pure SPA. The WebView approach is the only realistic path — and it's what most apps like Swiggy, Zomato, etc. do for non-critical screens.

## Before you click Run in Android Studio

1. **Publish the app in Lovable** (top-right Publish button) — otherwise the WebView shows the preview URL, which can rotate.
2. Once published, edit `capacitor.config.ts` and replace `server.url` with your published URL (e.g. `https://evchargehub.lovable.app`).
3. Run:
   ```bash
   bunx cap sync android
   ```
4. In Android Studio: **File → Open → select the `android/` folder**.
5. Wait for Gradle sync (first time ~5 min, downloads SDK pieces).
6. Plug in your phone (USB debugging on) or start an emulator → press ▶.

## You do NOT need these for the WebView build

Because everything runs in the web layer (Lovable Cloud handles auth, Maps runs as the JS map, Razorpay uses the web SDK):
- ❌ `local.properties` MAPS_API_KEY
- ❌ `google-services.json`
- ❌ Native Razorpay SDK

You only need those if you later decide to swap any screen to a **native** Android implementation.

## If the WebView shows a blank screen on phone

- Make sure the phone has internet.
- The URL in `capacitor.config.ts` must be HTTPS and reachable from the phone's browser.
- Check `adb logcat | grep Capacitor` for the actual error.
