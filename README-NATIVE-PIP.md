# IsotopeAI Android Native Picture-in-Picture Patch

This patch makes the existing Focus-page **Picture-in-Picture** button work in the Capacitor Android APK.

## What it preserves

- The existing Isotope timer PiP renderer and visual layout.
- Live Pomodoro/stopwatch time and status.
- Question tracker counts and target.
- Correct, Incorrect, and Skip actions through Android's PiP action menu.
- Automatic cleanup when the user returns to the full app.

## Apply

From the root of `Suydev/isotope-apk`:

```bash
git apply isotope-native-pip.patch
git add package.json android-pip.js scripts/apply-native-pip.js
git commit -m "feat(android): add native timer picture-in-picture"
git push origin main
```

GitHub Actions will generate the Android project, install the custom `MainActivity`, inject the WebView PiP polyfill, and build the APK.

## Device requirements

- Android 8.0 / API 26 or newer for system Picture-in-Picture.
- The app continues to run normally on Android 7.x, but PiP is unavailable there.

## Verification

1. Install the new debug APK from GitHub Actions.
2. Open Focus and start a timer.
3. Press the existing Picture-in-Picture icon.
4. Confirm the compact timer appears and continues updating.
5. Open the Android PiP controls and test Correct, Incorrect, and Skip.
6. Return to the app and confirm the normal Focus UI is restored.
