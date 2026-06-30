package in.isotopeai.app;

import android.app.PictureInPictureParams;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean androidBridgeInstalled = false;
    private boolean inPictureInPicture = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        installIsotopeAndroidBridge();
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

    private boolean supportsPictureInPicture() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    }

    private void enterFocusPictureInPicture() {
        if (!supportsPictureInPicture()) {
            notifyPipMode(false);
            return;
        }
        try {
            PictureInPictureParams params = new PictureInPictureParams.Builder()
                .setAspectRatio(new Rational(16, 9))
                .build();
            enterPictureInPictureMode(params);
        } catch (Exception ignored) {
            notifyPipMode(false);
        }
    }

    private void notifyPipMode(boolean active) {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            return;
        }
        String script = "window.dispatchEvent(new CustomEvent('isotope:pip-mode',{detail:{active:" + active + "}}));";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        inPictureInPicture = isInPictureInPictureMode;
        notifyPipMode(isInPictureInPictureMode);
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
            runOnUiThread(() -> enterFocusPictureInPicture());
        }
    }
}
