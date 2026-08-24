package in.isotopeai.app;

import android.app.PictureInPictureParams;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Rational;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    public static final String ACTION_FLOATING_TIMER_ACTION = "in.isotopeai.app.action.FLOATING_TIMER_ACTION";
    public static final String PREFS_FLOATING_TIMER = "isotope_floating_timer";
    public static final String PREF_ACTION_QUEUE = "action_queue";

    private boolean androidBridgeInstalled = false;
    private boolean floatingActionReceiverRegistered = false;
    private boolean inPictureInPicture = false;

    private final BroadcastReceiver floatingActionReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent != null && ACTION_FLOATING_TIMER_ACTION.equals(intent.getAction())) {
                replayFloatingTimerActions();
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        installIsotopeAndroidBridge();
        registerFloatingActionReceiver();
        PipHttpServer.start(this);
        // Handle cold-start deep link (app launched from invite/community link)
        handleDeepLinkIntent(getIntent(), false);
    }

    /**
     * Focus sessions must survive app exit / Doze. The JS layer shows an
     * app-styled explainer card first (see __isoBatteryPrompt in
     * android-bridge.js), then calls IsotopeAndroid.requestBatteryExemption()
     * which fires the system intent. No jarring cold popup.
     */

    @Override
    public void onStart() {
        super.onStart();
        PipHttpServer.start(this);
        installIsotopeAndroidBridge();
        replayFloatingTimerActions();
    }

    @Override
    public void onResume() {
        super.onResume();
        PipHttpServer.start(this);
        installIsotopeAndroidBridge();
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
            webView.post(() -> {
                webView.invalidate();
                webView.evaluateJavascript(
                    "window.__isoAndroidForceRepaint&&window.__isoAndroidForceRepaint('main-activity:onResume');",
                    null
                );
            });
        }
        replayFloatingTimerActions();
    }

    /**
     * The manifest declares configChanges="orientation|screenSize|..." so the Activity is
     * NOT destroyed/recreated on rotation — Android calls this method instead. Neither
     * WebView's compositor repaint nor the JS-side 'visibilitychange'/'focus' listeners fire
     * on a pure rotation, which previously left the screen fully black after portrait &lt;-&gt;
     * landscape with no recovery until the process was killed/reinstalled. Force the same
     * invalidate + JS repaint used on onResume so rotation always leaves a rendered frame.
     */
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        webView.post(() -> {
            webView.requestLayout();
            webView.invalidate();
            webView.evaluateJavascript(
                "window.__isoAndroidForceRepaint&&window.__isoAndroidForceRepaint('main-activity:onConfigurationChanged');" +
                "window.dispatchEvent(new Event('orientationchange'));",
                null
            );
        });
        // Layout after a rotation can settle a frame or two later than the first post(); repaint
        // again shortly after so a still-black WebView gets a second forced compositor pass.
        webView.postDelayed(() -> {
            webView.requestLayout();
            webView.invalidate();
            webView.evaluateJavascript(
                "window.__isoAndroidForceRepaint&&window.__isoAndroidForceRepaint('main-activity:onConfigurationChanged-settled');",
                null
            );
        }, 350);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        replayFloatingTimerActions();
        // Handle warm-start deep link (app already running when link tapped)
        handleDeepLinkIntent(intent, true);
    }

    /**
     * Parses an incoming deep-link intent and routes the WebView to the correct page.
     * Handles:
     *   https://isotopeai.in/invite/<code>
     *   https://www.isotopeai.in/invite/<code>
     *   https://isotopeai.in/community/<path>
     *   isotopeai://invite/<code>
     *
     * @param intent    the incoming intent
     * @param immediate true on warm-start (WebView is running); false on cold-start (defer)
     */
    private void handleDeepLinkIntent(Intent intent, boolean immediate) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!android.content.Intent.ACTION_VIEW.equals(action)) return;
        Uri uri = intent.getData();
        if (uri == null) return;

        // OAuth return carries tokens in the URI fragment (#access_token=...&refresh_token=...).
        // The WebView MUST receive that fragment verbatim so supabase-js can consume it
        // (detectSessionInUrl); dropping it destroys the Google sign-in.
        String fragment = uri.getEncodedFragment();
        String webRoute = resolveDeepLinkRoute(uri);
        if (webRoute == null) return;
        if (fragment != null && !fragment.isEmpty() && webRoute.startsWith("/auth/callback") && !webRoute.contains("#")) {
            webRoute = webRoute + "#" + fragment;
        }

        if (immediate) {
            navigateWebViewTo(webRoute);
        } else {
            // Cold start: defer until the bridge signals the app is ready
            final String route = webRoute;
            android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
            handler.postDelayed(() -> navigateWebViewTo(route), 1500);
        }
    }

    /**
     * Converts a deep-link URI into a WebView-internal route string, or null if not a
     * recognised IsotopeAI deep link.
     */
    private String resolveDeepLinkRoute(Uri uri) {
        String scheme = uri.getScheme();
        String host   = uri.getHost();
        String path   = uri.getPath();
        if (path == null) path = "";

        // Custom scheme: isotopeai://invite/<code> and isotopeai://auth/callback
        // Android Uri.parse gives host="invite", path="/<code>" for this format,
        // so we must NOT try to strip "/invite/" from path — path is already just
        // "/<code>". Use the host to detect the invite route, then read code from path.
        if ("isotopeai".equalsIgnoreCase(scheme)) {
            if ("invite".equalsIgnoreCase(host) && !path.isEmpty()) {
                // isotopeai://invite/<code>  →  host="invite", path="/<code>"
                String code = path.replaceFirst("^/+", "").trim();
                if (!code.isEmpty()) return "/invite/" + code;
            } else if (path.startsWith("/invite/")) {
                // Fallback: isotopeai:///invite/<code> or isotopeai:/invite/<code>
                String code = path.replaceFirst("^/invite/?", "").trim();
                if (!code.isEmpty()) return "/invite/" + code;
            } else if ("auth".equalsIgnoreCase(host) && path.startsWith("/callback")) {
                // isotopeai://auth/callback (OAuth redirect)
                return "/auth/callback";
            }
            return null;
        }

        // HTTPS: isotopeai.in or www.isotopeai.in
        if ("https".equalsIgnoreCase(scheme) &&
            host != null &&
            (host.equalsIgnoreCase("isotopeai.in") || host.equalsIgnoreCase("www.isotopeai.in"))) {

            if (path.startsWith("/invite/")) {
                String code = path.replaceFirst("^/invite/?", "").trim();
                return code.isEmpty() ? "/community" : "/invite/" + code;
            }
            if (path.startsWith("/community")) {
                return path;
            }
            if (path.startsWith("/auth/callback")) {
                return "/auth/callback";
            }
        }

        // HTTP/HTTPS localhost OAuth callback (Capacitor https://localhost:6767)
        if (("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) &&
            host != null &&
            (host.equalsIgnoreCase("localhost") || host.startsWith("localhost:"))) {
            if (path.startsWith("/auth/callback") || path.startsWith("/callback")) {
                return "/auth/callback";
            }
        }
        return null;
    }

    /**
     * Safely navigates the Capacitor WebView to an internal route using the bridge's
     * navigation helper, falling back to history.pushState and location.href.
     */
    private void navigateWebViewTo(String route) {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        String safeRoute = route.replace("'", "\\'").replace("\\", "\\\\");
        String js = "(function(){"
            + "try{"
            + "if(window.__iso_navigate&&typeof window.__iso_navigate==='function'){"
            + "window.__iso_navigate('" + safeRoute + "');return;"
            + "}"
            + "if(window.history&&typeof window.history.pushState==='function'){"
            + "window.history.pushState({},'','" + safeRoute + "');"
            + "window.dispatchEvent(new PopStateEvent('popstate',{state:{}}));return;"
            + "}"
            + "window.location.href='" + safeRoute + "';"
            + "}catch(e){window.location.href='" + safeRoute + "';}"
            + "})();";
        getBridge().getWebView().post(() ->
            getBridge().getWebView().evaluateJavascript(js, null)
        );
    }

    private void installIsotopeAndroidBridge() {
        if (androidBridgeInstalled || getBridge() == null || getBridge().getWebView() == null) {
            return;
        }
        WebView webView = getBridge().getWebView();
        configureWebViewForAndroidApp(webView);
        webView.addJavascriptInterface(new IsotopeAndroidInterface(), "IsotopeAndroid");
        androidBridgeInstalled = true;
    }

    private void configureWebViewForAndroidApp(WebView webView) {
        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
        }
    }

    private void registerFloatingActionReceiver() {
        if (floatingActionReceiverRegistered) {
            return;
        }
        IntentFilter filter = new IntentFilter(ACTION_FLOATING_TIMER_ACTION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(floatingActionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(floatingActionReceiver, filter);
        }
        floatingActionReceiverRegistered = true;
    }

    private boolean hasOverlayPermissionInternal() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this);
    }

    private void requestOverlayPermissionInternal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || hasOverlayPermissionInternal()) {
            return;
        }
        Intent intent = new Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:" + getPackageName())
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(intent);
    }

    private void startFloatingTimerService(String stateJson) {
        PipHttpServer.setLastState(stateJson);
        if (!hasOverlayPermissionInternal()) {
            requestOverlayPermissionInternal();
            return;
        }
        Intent intent = new Intent(this, FloatingTimerService.class)
            .setAction(FloatingTimerService.ACTION_START)
            .putExtra(FloatingTimerService.EXTRA_STATE_JSON, stateJson);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
    }

    private void updateFloatingTimerService(String stateJson) {
        PipHttpServer.setLastState(stateJson);
        if (!hasOverlayPermissionInternal()) {
            return;
        }
        Intent intent = new Intent(this, FloatingTimerService.class)
            .setAction(FloatingTimerService.ACTION_UPDATE)
            .putExtra(FloatingTimerService.EXTRA_STATE_JSON, stateJson);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
    }

    private void stopFloatingTimerService() {
        Intent intent = new Intent(this, FloatingTimerService.class)
            .setAction(FloatingTimerService.ACTION_STOP);
        stopService(intent);
    }

    private void expandFloatingTimerInternal() {
        Intent intent = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
    }

    private boolean supportsPictureInPicture() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    }

    private Rational safeAspectRatio(int requestedWidth, int requestedHeight) {
        int width = Math.max(1, requestedWidth);
        int height = Math.max(1, requestedHeight);
        double ratio = (double) width / (double) height;
        if (ratio < (1.0 / 2.39)) {
            return new Rational(100, 239);
        }
        if (ratio > 2.39) {
            return new Rational(239, 100);
        }
        return new Rational(width, height);
    }

    private void enterReducedSystemPictureInPicture(int width, int height) {
        if (!supportsPictureInPicture()) {
            notifyPipMode(false);
            return;
        }
        try {
            PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder()
                .setAspectRatio(safeAspectRatio(width, height));
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

    private void notifyPipMode(boolean active) {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            return;
        }
        String script = "window.dispatchEvent(new CustomEvent('isotope:pip-mode',{detail:{active:" + active + "}}));";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    public void replayFloatingTimerActions() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            return;
        }
        JSONArray queue = readActionQueue(this);
        if (queue.length() == 0) {
            return;
        }
        JSONObject action = queue.optJSONObject(0);
        if (action == null) {
            removeQueuedAction(this, null);
            replayFloatingTimerActions();
            return;
        }
        String actionId = action.optString("id", "");
        String script = "(function(){try{return !!(window.__ISO_FLOATING_TIMER__&&window.__ISO_FLOATING_TIMER__.handleNativeAction(" +
            action.toString() +
            "));}catch(e){console.error('[IsotopeAI Floating Timer] native action failed',e);return false;}})();";
        webView.post(() -> webView.evaluateJavascript(script, result -> {
            if ("true".equals(result)) {
                removeQueuedAction(MainActivity.this, actionId);
                replayFloatingTimerActions();
            }
        }));
    }

    public static void enqueueFloatingTimerAction(Context context, String type, int value) {
        if (!isAllowedFloatingTimerAction(type)) {
            return;
        }
        try {
            JSONObject action = new JSONObject();
            action.put("id", System.currentTimeMillis() + "-" + Math.abs(type.hashCode()));
            action.put("type", type);
            if ("setTarget".equals(type)) {
                action.put("value", Math.max(0, Math.min(9999, value)));
            }
            JSONArray queue = readActionQueue(context);
            queue.put(action);
            writeActionQueue(context, queue);
            Intent intent = new Intent(ACTION_FLOATING_TIMER_ACTION).setPackage(context.getPackageName());
            context.sendBroadcast(intent);
        } catch (Exception ignored) {
        }
    }

    static boolean isAllowedFloatingTimerAction(String type) {
        return "correct".equals(type)
            || "incorrect".equals(type)
            || "skipped".equals(type)
            || "undo".equals(type)
            || "setTarget".equals(type)
            || "expand".equals(type)
            || "close".equals(type)
            || "pause".equals(type)
            || "resume".equals(type)
            || "togglePause".equals(type);
    }

    private static JSONArray readActionQueue(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_FLOATING_TIMER, Context.MODE_PRIVATE);
            return new JSONArray(prefs.getString(PREF_ACTION_QUEUE, "[]"));
        } catch (Exception error) {
            return new JSONArray();
        }
    }

    private static void writeActionQueue(Context context, JSONArray queue) {
        context.getSharedPreferences(PREFS_FLOATING_TIMER, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_ACTION_QUEUE, queue.toString())
            .apply();
    }

    private static void removeQueuedAction(Context context, String actionId) {
        JSONArray queue = readActionQueue(context);
        JSONArray next = new JSONArray();
        for (int i = 0; i < queue.length(); i += 1) {
            JSONObject item = queue.optJSONObject(i);
            if (item == null) {
                continue;
            }
            if (actionId != null && actionId.equals(item.optString("id", ""))) {
                continue;
            }
            next.put(item);
        }
        writeActionQueue(context, next);
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        inPictureInPicture = isInPictureInPictureMode;
        notifyPipMode(isInPictureInPictureMode);
    }

    @Override
    public void onDestroy() {
        if (floatingActionReceiverRegistered) {
            try {
                unregisterReceiver(floatingActionReceiver);
            } catch (IllegalArgumentException ignored) {
            }
            floatingActionReceiverRegistered = false;
        }
        super.onDestroy();
    }

    public class IsotopeAndroidInterface {
        @JavascriptInterface
        public boolean hasOverlayPermission() {
            return hasOverlayPermissionInternal();
        }

        @JavascriptInterface
        public void requestOverlayPermission() {
            runOnUiThread(() -> requestOverlayPermissionInternal());
        }

        @JavascriptInterface
        public void startFloatingTimer(String stateJson) {
            runOnUiThread(() -> startFloatingTimerService(stateJson));
        }

        @JavascriptInterface
        public void updateFloatingTimerState(String stateJson) {
            runOnUiThread(() -> updateFloatingTimerService(stateJson));
        }

        @JavascriptInterface
        public void stopFloatingTimer() {
            runOnUiThread(() -> stopFloatingTimerService());
        }

        @JavascriptInterface
        public void replayFloatingTimerActions() {
            runOnUiThread(() -> MainActivity.this.replayFloatingTimerActions());
        }

        @JavascriptInterface
        public void expandFloatingTimer() {
            runOnUiThread(() -> expandFloatingTimerInternal());
        }

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
            runOnUiThread(() -> enterReducedSystemPictureInPicture(340, 390));
        }

        @JavascriptInterface
        public void enterFocusPipWithSize(double width, double height) {
            int safeWidth = Math.max(1, (int) Math.round(width));
            int safeHeight = Math.max(1, (int) Math.round(height));
            runOnUiThread(() -> enterReducedSystemPictureInPicture(safeWidth, safeHeight));
        }

        @JavascriptInterface
        public void expandFocusPip() {
            runOnUiThread(() -> expandFloatingTimerInternal());
        }

        @JavascriptInterface
        public boolean isBatteryOptimized() {
            try {
                android.os.PowerManager pm = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
                return pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName());
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void requestBatteryExemption() {
            runOnUiThread(() -> {
                try {
                    SharedPreferences sp = getSharedPreferences("isotope_floating_timer", Context.MODE_PRIVATE);
                    sp.edit().putBoolean("isotope_battery_prompted", true).apply();
                    startActivity(new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                            Uri.parse("package:" + getPackageName())));
                } catch (Exception e) {
                    android.util.Log.w("IsotopeAI", "battery exemption request failed: " + e.getMessage());
                }
            });
        }

        /**
         * Saves a file into the public Downloads folder (MediaStore) so the user
         * can retrieve it with any file manager. Used by the Settings "Export
         * JSON backup" flow — Android WebView silently drops <a download> clicks
         * for blob: URLs, so exports must go through the native layer.
         *
         * @param fileName target file name in Downloads (e.g. isotope-backup-2026-08-22.json)
         * @param base64Content base64-encoded file body
         * @return "OK:<path>" on success, "ERR:<message>" on failure
         */
        @JavascriptInterface
        public void openExternalUrl(String url) {
            runOnUiThread(() -> {
                try {
                    android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url));
                    intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception e) {
                    android.util.Log.w("IsotopeAI", "openExternalUrl failed: " + e.getMessage());
                }
            });
        }

        @JavascriptInterface
        public String saveToDownloads(String fileName, String base64Content) {
            try {
                byte[] data = android.util.Base64.decode(base64Content, android.util.Base64.DEFAULT);
                String safeName = fileName == null ? "isotope-export.json"
                    : fileName.replaceAll("[^A-Za-z0-9._ ()-]", "_");
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                    android.content.ContentValues cv = new android.content.ContentValues();
                    cv.put(android.provider.MediaStore.Downloads.DISPLAY_NAME, safeName);
                    cv.put(android.provider.MediaStore.Downloads.MIME_TYPE, "application/json");
                    cv.put(android.provider.MediaStore.Downloads.IS_PENDING, 1);
                    android.net.Uri uri = getContentResolver().insert(
                        android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) return "ERR:MediaStore insert failed";
                    try (java.io.OutputStream os = getContentResolver().openOutputStream(uri)) {
                        os.write(data);
                    }
                    cv.clear();
                    cv.put(android.provider.MediaStore.Downloads.IS_PENDING, 0);
                    getContentResolver().update(uri, cv, null, null);
                    final String doneName = safeName;
                    runOnUiThread(() -> {
                        try { android.widget.Toast.makeText(MainActivity.this, "Saved to Downloads/" + doneName + " — open Files app to view", android.widget.Toast.LENGTH_LONG).show(); } catch (Exception ignored) {}
                        try {
                            android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                            if (nm != null && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                                android.app.NotificationChannel ch = new android.app.NotificationChannel("isotope-downloads", "Downloads", android.app.NotificationManager.IMPORTANCE_DEFAULT);
                                nm.createNotificationChannel(ch);
                            }
                            android.content.Intent view = new android.content.Intent(android.content.Intent.ACTION_VIEW);
                            view.setDataAndType(uri, "application/json");
                            view.addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION | android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                            android.app.PendingIntent pi = android.app.PendingIntent.getActivity(MainActivity.this, doneName.hashCode(), view, android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE);
                            android.app.Notification n = new android.app.Notification.Builder(MainActivity.this, "isotope-downloads")
                                .setSmallIcon(getApplicationInfo().icon)
                                .setContentTitle("Backup saved")
                                .setContentText("Downloads/" + doneName + " — tap to open")
                                .setContentIntent(pi)
                                .setAutoCancel(true)
                                .build();
                            nm.notify(doneName.hashCode() & 0x7fffffff, n);
                        } catch (Exception ignored) {}
                    });
                    return "OK:" + safeName;
                } else {
                    java.io.File dir = android.os.Environment.getExternalStoragePublicDirectory(
                        android.os.Environment.DIRECTORY_DOWNLOADS);
                    if (!dir.exists()) dir.mkdirs();
                    java.io.File out = new java.io.File(dir, safeName);
                    try (java.io.FileOutputStream fos = new java.io.FileOutputStream(out)) {
                        fos.write(data);
                    }
                    final String donePath = out.getAbsolutePath();
                    runOnUiThread(() -> {
                        try { android.widget.Toast.makeText(MainActivity.this, "Saved to " + donePath, android.widget.Toast.LENGTH_LONG).show(); } catch (Exception ignored) {}
                    });
                    return "OK:" + out.getAbsolutePath();
                }
            } catch (Exception e) {
                return "ERR:" + e.getMessage();
            }
        }
    }
}
