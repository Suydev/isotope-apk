#!/usr/bin/env node
/**
 * Installs IsotopeAI's native Android Picture-in-Picture integration.
 *
 * This script is executed by Capacitor's `capacitor:sync:before` hook, after
 * `npx cap add android` has generated the Android project and before Capacitor
 * copies www/ into the native app.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const WWW_DIR = process.env.WWW_DIR || path.join(ROOT_DIR, 'www');
const ANDROID_DIR = process.env.ANDROID_DIR || path.join(ROOT_DIR, 'android');
const PIP_SOURCE = path.join(ROOT_DIR, 'android-pip.js');
const PIP_DEST = path.join(WWW_DIR, 'android-pip.js');
const INDEX_PATH = path.join(WWW_DIR, 'index.html');
const MANIFEST_PATH = path.join(ANDROID_DIR, 'app', 'src', 'main', 'AndroidManifest.xml');
const JAVA_DIR = path.join(ANDROID_DIR, 'app', 'src', 'main', 'java', 'in', 'isotopeai', 'app');
const MAIN_ACTIVITY_PATH = path.join(JAVA_DIR, 'MainActivity.java');
const DRAWABLE_DIR = path.join(ANDROID_DIR, 'app', 'src', 'main', 'res', 'drawable');

function fail(message) {
  console.error('[native-pip] ERROR:', message);
  process.exit(1);
}

function ensureFile(filePath, label) {
  if (!fs.existsSync(filePath)) fail(label + ' not found: ' + filePath);
}

function injectWebPolyfill() {
  ensureFile(PIP_SOURCE, 'android-pip.js');
  ensureFile(INDEX_PATH, 'www/index.html');
  fs.mkdirSync(WWW_DIR, { recursive: true });
  fs.copyFileSync(PIP_SOURCE, PIP_DEST);

  let html = fs.readFileSync(INDEX_PATH, 'utf8');
  if (!html.includes('android-pip.js')) {
    const tag = '<script src="/android-pip.js"></script>';
    const bridgeTag = /(<script[^>]+src=["']\/android-bridge\.js["'][^>]*><\/script>)/i;
    if (bridgeTag.test(html)) {
      html = html.replace(bridgeTag, '$1\n    ' + tag);
    } else {
      html = html.replace(/<head>/i, '<head>\n    ' + tag);
    }
    fs.writeFileSync(INDEX_PATH, html, 'utf8');
    console.log('[native-pip] ✓ Injected android-pip.js into www/index.html');
  } else {
    console.log('[native-pip] ○ android-pip.js already injected');
  }
}

function addActivityAttribute(tag, name, value) {
  if (tag.includes(name + '=')) return tag;
  return tag.replace(/>\s*$/, '\n            ' + name + '="' + value + '">');
}

function patchManifest() {
  ensureFile(MANIFEST_PATH, 'AndroidManifest.xml');
  let manifest = fs.readFileSync(MANIFEST_PATH, 'utf8');
  const activityPattern = /<activity\b[^>]*android:name=["'](?:\.MainActivity|in\.isotopeai\.app\.MainActivity)["'][^>]*>/i;
  const match = manifest.match(activityPattern);
  if (!match) fail('MainActivity declaration not found in AndroidManifest.xml');

  let activity = match[0];
  activity = addActivityAttribute(activity, 'android:supportsPictureInPicture', 'true');
  activity = addActivityAttribute(activity, 'android:resizeableActivity', 'true');
  manifest = manifest.replace(match[0], activity);
  fs.writeFileSync(MANIFEST_PATH, manifest, 'utf8');
  console.log('[native-pip] ✓ Enabled Picture-in-Picture in AndroidManifest.xml');
}

const MAIN_ACTIVITY = `package in.isotopeai.app;

import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final String ACTION_CORRECT = "in.isotopeai.app.pip.CORRECT";
    private static final String ACTION_INCORRECT = "in.isotopeai.app.pip.INCORRECT";
    private static final String ACTION_SKIPPED = "in.isotopeai.app.pip.SKIPPED";

    private boolean receiverRegistered = false;

    private final BroadcastReceiver pipActionReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null || intent.getAction() == null) return;
            switch (intent.getAction()) {
                case ACTION_CORRECT:
                    dispatchActionToWeb("correct");
                    break;
                case ACTION_INCORRECT:
                    dispatchActionToWeb("incorrect");
                    break;
                case ACTION_SKIPPED:
                    dispatchActionToWeb("skipped");
                    break;
                default:
                    break;
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPipActionReceiver();

        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new NativePictureInPictureBridge(), "IsotopeNativePiP");
    }

    private void registerPipActionReceiver() {
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_CORRECT);
        filter.addAction(ACTION_INCORRECT);
        filter.addAction(ACTION_SKIPPED);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(pipActionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(pipActionReceiver, filter);
        }
        receiverRegistered = true;
    }

    private boolean supportsPictureInPicture() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    }

    private void enterNativePictureInPicture(int requestedWidth, int requestedHeight) {
        if (!supportsPictureInPicture() || isInPictureInPictureMode()) return;

        int width = Math.max(1, requestedWidth);
        int height = Math.max(1, requestedHeight);
        PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder()
            .setAspectRatio(new Rational(width, height))
            .setActions(buildPipActions());

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setSeamlessResizeEnabled(false);
            builder.setAutoEnterEnabled(false);
        }

        enterPictureInPictureMode(builder.build());
    }

    private List<RemoteAction> buildPipActions() {
        List<RemoteAction> actions = new ArrayList<>();
        actions.add(makeAction(ACTION_CORRECT, "Correct", R.drawable.ic_pip_correct, 8101));
        actions.add(makeAction(ACTION_INCORRECT, "Incorrect", R.drawable.ic_pip_incorrect, 8102));
        actions.add(makeAction(ACTION_SKIPPED, "Skip", R.drawable.ic_pip_skip, 8103));
        return actions;
    }

    private RemoteAction makeAction(String action, String title, int iconResource, int requestCode) {
        Intent intent = new Intent(action).setPackage(getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pendingIntent = PendingIntent.getBroadcast(this, requestCode, intent, flags);
        Icon icon = Icon.createWithResource(this, iconResource);
        return new RemoteAction(icon, title, title, pendingIntent);
    }

    private void dispatchActionToWeb(String action) {
        WebView webView = getBridge().getWebView();
        String script = "window.__ISO_ANDROID_PIP__&&window.__ISO_ANDROID_PIP__.action('" + action + "');";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void notifyWebPictureInPictureClosed() {
        WebView webView = getBridge().getWebView();
        String script = "window.__ISO_ANDROID_PIP__&&window.__ISO_ANDROID_PIP__._onExit();";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void expandFromPictureInPicture() {
        Intent intent = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        if (!isInPictureInPictureMode) notifyWebPictureInPictureClosed();
    }

    @Override
    protected void onDestroy() {
        if (receiverRegistered) {
            try {
                unregisterReceiver(pipActionReceiver);
            } catch (IllegalArgumentException ignored) {
                // Receiver was already unregistered by the system.
            }
            receiverRegistered = false;
        }
        super.onDestroy();
    }

    public final class NativePictureInPictureBridge {
        @JavascriptInterface
        public void enter(double width, double height) {
            runOnUiThread(() -> enterNativePictureInPicture((int) Math.round(width), (int) Math.round(height)));
        }

        @JavascriptInterface
        public void expand() {
            runOnUiThread(() -> expandFromPictureInPicture());
        }

        @JavascriptInterface
        public boolean isSupported() {
            return supportsPictureInPicture();
        }
    }
}
`;

const VECTOR_CORRECT = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:pathData="M9,16.17L4.83,12l-1.42,1.41L9,19 21,7l-1.41,-1.41z" />
</vector>
`;

const VECTOR_INCORRECT = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:pathData="M18.3,5.71L12,12l6.3,6.29 -1.41,1.42L10.59,13.41 4.29,19.71 2.88,18.29 9.17,12 2.88,5.71 4.29,4.29 10.59,10.59 16.89,4.29z" />
</vector>
`;

const VECTOR_SKIP = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:pathData="M6,18l8.5,-6L6,6v12zM16,6v12h2V6h-2z" />
</vector>
`;

function writeNativeFiles() {
  fs.mkdirSync(JAVA_DIR, { recursive: true });
  fs.mkdirSync(DRAWABLE_DIR, { recursive: true });
  fs.writeFileSync(MAIN_ACTIVITY_PATH, MAIN_ACTIVITY, 'utf8');
  fs.writeFileSync(path.join(DRAWABLE_DIR, 'ic_pip_correct.xml'), VECTOR_CORRECT, 'utf8');
  fs.writeFileSync(path.join(DRAWABLE_DIR, 'ic_pip_incorrect.xml'), VECTOR_INCORRECT, 'utf8');
  fs.writeFileSync(path.join(DRAWABLE_DIR, 'ic_pip_skip.xml'), VECTOR_SKIP, 'utf8');
  console.log('[native-pip] ✓ Installed MainActivity native PiP bridge and action icons');
}

console.log('\n=== Installing native Android Picture-in-Picture ===');
injectWebPolyfill();
patchManifest();
writeNativeFiles();
console.log('[native-pip] Native Picture-in-Picture installation complete\n');
