package in.isotopeai.app;

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
    private static final String ACTION_PIP_RESULT = "in.isotopeai.app.action.PIP_RESULT";
    private static final String EXTRA_PIP_RESULT = "pip_result";

    private boolean androidBridgeInstalled = false;
    private boolean inPictureInPicture = false;
    private boolean pipReceiverRegistered = false;

    private final BroadcastReceiver pipActionReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null || !ACTION_PIP_RESULT.equals(intent.getAction())) {
                return;
            }
            String result = intent.getStringExtra(EXTRA_PIP_RESULT);
            if ("correct".equals(result) || "incorrect".equals(result) || "skipped".equals(result)) {
                dispatchPipAction(result);
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        installIsotopeAndroidBridge();
        registerPipActionReceiver();
    }

    @Override
    public void onStart() {
        super.onStart();
        installIsotopeAndroidBridge();
    }

    private void installIsotopeAndroidBridge() {
        if (androidBridgeInstalled || getBridge() == null || getBridge().getWebView() == null) {
            return;
        }
        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new IsotopeAndroidInterface(), "IsotopeAndroid");
        androidBridgeInstalled = true;
    }

    private void registerPipActionReceiver() {
        if (pipReceiverRegistered) {
            return;
        }
        IntentFilter filter = new IntentFilter(ACTION_PIP_RESULT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(pipActionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(pipActionReceiver, filter);
        }
        pipReceiverRegistered = true;
    }

    private boolean supportsPictureInPicture() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    }

    private Rational safeAspectRatio(int requestedWidth, int requestedHeight) {
        int width = Math.max(1, requestedWidth);
        int height = Math.max(1, requestedHeight);
        double ratio = (double) width / (double) height;

        // Android accepts PiP ratios in approximately [1 / 2.39, 2.39].
        if (ratio < (1.0 / 2.39)) {
            return new Rational(100, 239);
        }
        if (ratio > 2.39) {
            return new Rational(239, 100);
        }
        return new Rational(width, height);
    }

    private List<RemoteAction> buildPipActions() {
        List<RemoteAction> actions = new ArrayList<>();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return actions;
        }
        actions.add(buildPipAction("correct", "Correct", R.drawable.ic_pip_correct, 3101));
        actions.add(buildPipAction("incorrect", "Incorrect", R.drawable.ic_pip_incorrect, 3102));
        actions.add(buildPipAction("skipped", "Skip", R.drawable.ic_pip_skip, 3103));
        return actions;
    }

    private RemoteAction buildPipAction(String result, String label, int iconRes, int requestCode) {
        Intent intent = new Intent(ACTION_PIP_RESULT)
            .setPackage(getPackageName())
            .putExtra(EXTRA_PIP_RESULT, result);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pendingIntent = PendingIntent.getBroadcast(this, requestCode, intent, flags);
        Icon icon = Icon.createWithResource(this, iconRes);
        return new RemoteAction(icon, label, label, pendingIntent);
    }

    private void enterFocusPictureInPicture(int width, int height) {
        if (!supportsPictureInPicture()) {
            notifyPipMode(false);
            return;
        }
        try {
            PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder()
                .setAspectRatio(safeAspectRatio(width, height))
                .setActions(buildPipActions());
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                builder.setSeamlessResizeEnabled(false);
            }
            boolean entered = enterPictureInPictureMode(builder.build());
            if (!entered) {
                notifyPipMode(false);
            }
        } catch (Exception error) {
            notifyPipMode(false);
        }
    }

    private void expandFocusPictureInPicture() {
        Intent intent = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
    }

    private void notifyPipMode(boolean active) {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            return;
        }
        String script = "window.dispatchEvent(new CustomEvent('isotope:pip-mode',{detail:{active:" + active + "}}));";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void dispatchPipAction(String action) {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            return;
        }
        String script = "window.__ISO_ANDROID_TIMER_PIP__&&window.__ISO_ANDROID_TIMER_PIP__.action('" + action + "');";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        inPictureInPicture = isInPictureInPictureMode;
        notifyPipMode(isInPictureInPictureMode);
    }

    @Override
    public void onDestroy() {
        if (pipReceiverRegistered) {
            try {
                unregisterReceiver(pipActionReceiver);
            } catch (IllegalArgumentException ignored) {
                // The receiver was already removed by the Android runtime.
            }
            pipReceiverRegistered = false;
        }
        super.onDestroy();
    }

    public class IsotopeAndroidInterface {
        @JavascriptInterface
        public boolean isPipSupported() {
            return supportsPictureInPicture();
        }

        @JavascriptInterface
        public boolean isInPipMode() {
            return inPictureInPicture;
        }

        @JavascriptInterface
        public void enterFocusPip() {
            runOnUiThread(() -> enterFocusPictureInPicture(340, 390));
        }

        @JavascriptInterface
        public void enterFocusPipWithSize(double width, double height) {
            int safeWidth = Math.max(1, (int) Math.round(width));
            int safeHeight = Math.max(1, (int) Math.round(height));
            runOnUiThread(() -> enterFocusPictureInPicture(safeWidth, safeHeight));
        }

        @JavascriptInterface
        public void expandFocusPip() {
            runOnUiThread(() -> expandFocusPictureInPicture());
        }
    }
}
