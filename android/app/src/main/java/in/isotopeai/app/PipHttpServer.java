package in.isotopeai.app;

import android.content.Context;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.Collections;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

public final class PipHttpServer {

    public static final int PORT = 3000;
    public static final int OAUTH_PORT = 6767;
    private static final String TAG = "IsotopeAI";

    private static final AtomicBoolean running = new AtomicBoolean(false);
    private static final AtomicLong seq = new AtomicLong(0);
    private static volatile String lastStateJson = null;
    private static volatile long lastStateAt = 0L;
    private static volatile boolean oauthReturnConsumed = false;

    /**
     * Clears the "already consumed" latch so a second sign-in attempt in the same
     * process still forwards its tokens. Without this, the first OAuth round trip
     * permanently flipped the flag and every later attempt was served the static
     * "Signed in" page while the tokens were silently discarded.
     */
    public static void resetOAuthReturn() {
        oauthReturnConsumed = false;
    }
    /**
     * Bounded worker pool for connections.
     *
     * Sized above the expected number of concurrent SSE streams, because each
     * event stream occupies its worker until the client disconnects — a pool
     * sized for request/response would stall as soon as two streams were open.
     * Daemon threads so they never hold the process alive.
     *
     * SynchronousQueue with a max: a task is either handed to a thread now or
     * rejected. Queueing connections would let a flood build an unbounded backlog
     * instead of failing fast, which is the behaviour a bounded pool exists for.
     */
    private static final ExecutorService workers = new ThreadPoolExecutor(
        2, 24, 30L, TimeUnit.SECONDS,
        new SynchronousQueue<>(),
        r -> {
            Thread t = new Thread(r, "iso-http-worker");
            t.setDaemon(true);
            return t;
        });

    private static final java.util.List<ServerSocket> sockets = new java.util.ArrayList<>();
    private static final java.util.List<Thread> threads = new java.util.ArrayList<>();
    private static final Set<OutputStream> pipEventClients = Collections.newSetFromMap(new ConcurrentHashMap<>());
    private static Context appContext;

    private PipHttpServer() {}

    public static void setLastState(String stateJson) {
        if (stateJson == null || stateJson.isEmpty()) return;
        lastStateJson = stateJson;
        lastStateAt = System.currentTimeMillis();
        seq.incrementAndGet();
    }

    public static String getLastStateJson() { return lastStateJson; }

    public static synchronized void start(Context context) {
        if (running.get()) return;
        appContext = context.getApplicationContext();
        running.set(true);
        int[] ports = { PORT, OAUTH_PORT };
        for (int port : ports) {
            final int p = port;
            Thread t = new Thread(() -> serveLoop(p), "iso-http-" + p);
            t.setDaemon(true);
            t.start();
            threads.add(t);
        }
        Log.i(TAG, "[PipHttp] listening on 127.0.0.1:" + PORT + " (pipapk) + 127.0.0.1:" + OAUTH_PORT + " (oauth-return)");
    }

    public static synchronized void stop() {
        running.set(false);
        for (ServerSocket ss : sockets) {
            try { if (ss != null && !ss.isClosed()) ss.close(); } catch (Exception ignored) {}
        }
        sockets.clear();
        threads.clear();
        for (OutputStream os : pipEventClients) {
            try { os.close(); } catch (Exception ignored) {}
        }
        pipEventClients.clear();
        Log.i(TAG, "[PipHttp] stopped");
    }

    private static void serveLoop(int port) {
        try {
            ServerSocket ss = new ServerSocket(port, 16, java.net.InetAddress.getByName("127.0.0.1"));
            synchronized (sockets) { sockets.add(ss); }
            while (running.get()) {
                final Socket sock = ss.accept();
                // A raw `new Thread(...)` per connection was unbounded: any app on
                // the device can open 127.0.0.1:3000 in a loop and spawn threads
                // until the process dies. A cached pool reuses idle threads and
                // the cap makes the failure mode "connections queue" instead of
                // "the app is killed".
                //
                // The bound has to exceed the number of long-lived SSE clients,
                // because each holds its thread for the life of the connection —
                // a pool sized for request/response would deadlock the moment two
                // event streams were open.
                try {
                    workers.execute(() -> handle(sock));
                } catch (RejectedExecutionException tooBusy) {
                    try { sock.close(); } catch (Exception ignored) {}
                }
            }
        } catch (Exception e) {
            if (running.get()) Log.w(TAG, "[PipHttp] server error on port " + port + ": " + e.getMessage());
        }
    }

    private static void handle(Socket sock) {
        try {
            sock.setSoTimeout(4000);
            BufferedReader in = new BufferedReader(new InputStreamReader(sock.getInputStream()));
            String requestLine = in.readLine();
            if (requestLine == null) { sock.close(); return; }
            String[] parts = requestLine.split(" ");
            String method = parts.length > 0 ? parts[0] : "";
            String rawPath = parts.length > 1 ? parts[1] : "/";
            String path = rawPath.split("\\?")[0];

            int contentLength = 0;
            String line;
            while ((line = in.readLine()) != null && !line.isEmpty()) {
                String[] h = line.split(":", 2);
                if (h.length == 2 && h[0].trim().equalsIgnoreCase("content-length")) {
                    try { contentLength = Integer.parseInt(h[1].trim()); } catch (Exception ignored) {}
                }
            }
            // Content-Length is attacker-controlled. This listens on loopback, but
            // ANY app on the device can reach 127.0.0.1:3000 — "local" is not
            // "trusted" on Android.
            //
            // Two bugs the previous loop had:
            //   for (int i = 0; i < contentLength; i++) body.append((char) in.read());
            //
            //   1. No cap. A request claiming Content-Length: 100000000 with no
            //      body ran 100M iterations building a StringBuilder. setSoTimeout
            //      does not bound it, because read() only throws once it actually
            //      blocks — at EOF it returns immediately.
            //   2. in.read() returns -1 at EOF, and (char) -1 is 0xFFFF, so a
            //      truncated body appended U+FFFF characters instead of stopping.
            //
            // The cap is generous next to the largest real payload (a timer state
            // snapshot is well under 4 KB) and small enough to be harmless.
            final int MAX_BODY = 64 * 1024;
            if (contentLength < 0) contentLength = 0;
            if (contentLength > MAX_BODY) contentLength = MAX_BODY;
            StringBuilder body = new StringBuilder(Math.min(contentLength, 8192));
            for (int i = 0; i < contentLength; i++) {
                int c = in.read();
                if (c < 0) break;   // EOF: the client sent less than it claimed
                body.append((char) c);
            }

            if ("OPTIONS".equals(method)) {
                writeOptions(sock);
                return;
            }

            if ("GET".equals(method) && "/api/health".equals(path)) {
                writeJson(sock, 200, "{\"ok\":true,\"status\":\"ok\",\"ts\":" + System.currentTimeMillis() + ",\"android\":true,\"local_server\":true}");
                return;
            }
            if ("GET".equals(method) && "/api/pip/state".equals(path)) {
                writeJson(sock, 200, statePayload());
                return;
            }
            if ("POST".equals(method) && "/api/pip/action".equals(path)) {
                writeJson(sock, 200, actionPayload(body.toString()));
                return;
            }
            if ("POST".equals(method) && "/__pip/state".equals(path)) {
                String p = body.toString();
                try {
                    JSONObject parsed = new JSONObject(p.isEmpty() ? "{}" : p);
                    if (parsed.length() > 0) {
                        lastStateJson = parsed.toString();
                        lastStateAt = System.currentTimeMillis();
                        seq.incrementAndGet();
                    }
                } catch (Exception ignored) {}
                writeJson(sock, 200, "{\"ok\":true,\"seq\":" + seq.get() + "}");
                return;
            }
            if ("GET".equals(method) && "/__pip/events".equals(path)) {
                handleSse(sock);
                return;
            }
            // OAuth loopback return. Google and Supabase both accept
            // http://localhost:<port>/... redirect URIs; custom schemes are
            // often rejected or stripped. The browser lands here, and the page
            // we serve forwards the URL FRAGMENT (which is never sent to a
            // server) into the app via isotopeai://auth/callback#<fragment>.
            //
            // AndroidManifest declares an intent filter for
            // http://localhost:6767/callback, so "/callback" must be handled
            // here or the redirect 404s and sign-in dead-ends.
            if ("GET".equals(method) && ("/callback".equals(path)
                    || "/auth/callback".equals(path)
                    || "/oauth-return".equals(path)
                    || "/auth/oauth-return".equals(path))) {
                writeHtml(sock, 200, oauthReturnConsumed ? oauthDoneHtml() : oauthReturnHtml());
                return;
            }
            if ("POST".equals(method) && "/__oauth/consumed".equals(path)) {
                oauthReturnConsumed = true;
                writeJson(sock, 200, "{\"ok\":true,\"consumed\":true}");
                return;
            }
            writeJson(sock, 404, "{\"ok\":false,\"error\":\"Not found\"}");
        } catch (Exception ignored) {
        } finally {
            try { sock.close(); } catch (Exception ignored) {}
        }
    }

    private static String statePayload() {
        try {
            JSONObject snap;
            if (lastStateJson != null) {
                snap = new JSONObject(lastStateJson);
            } else {
                snap = defaultSnapshot();
            }
            snap.put("ok", true);
            snap.put("seq", seq.get());
            snap.put("pipClients", pipEventClients.size());
            snap.put("pipConnected", lastStateAt > 0);
            snap.put("pipStateAt", lastStateAt);
            return snap.toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":\"state unavailable\"}";
        }
    }

    private static JSONObject defaultSnapshot() throws Exception {
        JSONObject o = new JSONObject();
        o.put("active", false).put("timerState", "idle").put("mode", "pomodoro").put("activePhase", JSONObject.NULL);
        o.put("displayedSeconds", 0).put("totalSeconds", 0).put("completionAtMs", 0).put("updatedAtMs", 0);
        o.put("pomodoroCycle", 1).put("pomodoroSessionsUntilLongBreak", 4);
        o.put("questionsAttempted", 0).put("questionsCorrect", 0).put("questionsIncorrect", 0).put("questionsSkipped", 0);
        o.put("targetQuestions", 0).put("undoAvailable", false).put("showQuestionControls", false);
        o.put("focusTypeLabel", "Focus").put("focusTypeIcon", "").put("theme", "dark");
        return o;
    }

    private static String actionPayload(String body) {
        try {
            JSONObject action = new JSONObject(body.isEmpty() ? "{}" : body);
            String type = action.optString("type", "");
            if (!MainActivity.isAllowedFloatingTimerAction(type)) {
                return "{\"ok\":false,\"error\":\"unknown action type\"}";
            }
            int value = 0;
            if ("setTarget".equals(type)) {
                double v = action.optDouble("value", Double.NaN);
                if (Double.isNaN(v)) return "{\"ok\":false,\"error\":\"setTarget requires a numeric value\"}";
                value = Math.min(9999, Math.max(0, (int) Math.round(v)));
            }
            MainActivity.enqueueFloatingTimerAction(appContext, type, value);
            pipBroadcast(type, value);
            JSONObject out = lastStateJson != null ? new JSONObject(lastStateJson) : defaultSnapshot();
            out.put("ok", true).put("applied", true).put("seq", seq.get());
            return out.toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":\"bad action\"}";
        }
    }

    private static void pipBroadcast(String type, int value) {
        JSONObject frame = new JSONObject();
        try {
            frame.put("type", type);
            if ("setTarget".equals(type)) frame.put("value", value);
            frame.put("ts", System.currentTimeMillis());
            frame.put("seq", seq.get());
        } catch (Exception ignored) {}
        String payload = "data: " + frame.toString() + "\n\n";
        byte[] bytes;
        try { bytes = payload.getBytes("UTF-8"); } catch (Exception e) { return; }
        for (OutputStream os : pipEventClients) {
            try { os.write(bytes); os.flush(); } catch (Exception ex) { pipEventClients.remove(os); }
        }
    }

    private static void handleSse(Socket sock) throws Exception {
        OutputStream os = sock.getOutputStream();
        String header = "HTTP/1.1 200 OK\r\n" +
                "Content-Type: text/event-stream\r\n" +
                "Cache-Control: no-cache, no-transform\r\n" +
                "Connection: keep-alive\r\n" +
                "Access-Control-Allow-Origin: *\r\n" +
                "Access-Control-Allow-Methods: GET,POST,OPTIONS\r\n" +
                "Access-Control-Allow-Headers: Content-Type,Authorization,apikey,x-client-info,prefer,range,X-Admin-Secret\r\n" +
                "X-Accel-Buffering: no\r\n\r\n" +
                "retry: 2000\n\n";
        os.write(header.getBytes("UTF-8"));
        os.flush();
        pipEventClients.add(os);
        try {
            while (running.get() && !sock.isClosed()) {
                Thread.sleep(15000);
                try { os.write(": ping\n\n".getBytes("UTF-8")); os.flush(); } catch (Exception e) { break; }
            }
        } catch (InterruptedException ignored) {
        } finally {
            pipEventClients.remove(os);
            try { sock.close(); } catch (Exception ignored) {}
        }
    }

    private static void writeOptions(Socket sock) throws Exception {
        OutputStream os = sock.getOutputStream();
        String h = "HTTP/1.1 204 No Content\r\n" +
                "Access-Control-Allow-Origin: *\r\n" +
                "Access-Control-Allow-Methods: GET,POST,OPTIONS\r\n" +
                "Access-Control-Allow-Headers: Content-Type,Authorization,apikey,x-client-info,prefer,range,X-Admin-Secret\r\n" +
                "Access-Control-Max-Age: 86400\r\n" +
                "Content-Length: 0\r\n" +
                "Connection: close\r\n\r\n";
        os.write(h.getBytes("UTF-8"));
        os.flush();
    }

    private static void writeJson(Socket sock, int status, String json) throws Exception {
        byte[] payload = json.getBytes("UTF-8");
        OutputStream os = sock.getOutputStream();
        String text = status == 200 ? "OK" : status == 404 ? "Not Found" : status == 400 ? "Bad Request" : "OK";
        os.write(("HTTP/1.1 " + status + " " + text + "\r\n" +
                "Content-Type: application/json\r\n" +
                "Cache-Control: no-store\r\n" +
                "Access-Control-Allow-Origin: *\r\n" +
                "Access-Control-Allow-Methods: GET,POST,OPTIONS\r\n" +
                "Access-Control-Allow-Headers: Content-Type,Authorization,apikey,x-client-info,prefer,range,X-Admin-Secret\r\n" +
                "Content-Length: " + payload.length + "\r\n" +
                "Connection: close\r\n\r\n").getBytes("UTF-8"));
        os.write(payload);
        os.flush();
    }

    private static void writeHtml(Socket sock, int status, String html) throws Exception {
        byte[] payload = html.getBytes("UTF-8");
        OutputStream os = sock.getOutputStream();
        os.write(("HTTP/1.1 " + status + " OK\r\n" +
                "Content-Type: text/html; charset=utf-8\r\n" +
                "Cache-Control: no-store\r\n" +
                "Access-Control-Allow-Origin: *\r\n" +
                "Content-Length: " + payload.length + "\r\n" +
                "Connection: close\r\n\r\n").getBytes("UTF-8"));
        os.write(payload);
        os.flush();
    }

    private static String oauthReturnHtml() {
        return "<!doctype html><html><head><meta charset=\"utf-8\">" +
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
            "<style>body{font-family:system-ui;background:#09090b;color:#e4e4e7;display:flex;" +
            "align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}" +
            ".c{max-width:420px;padding:32px}h1{font-size:20px;font-weight:800;color:#f97316}" +
            "p{color:#a1a1aa;font-size:14px;line-height:1.6}" +
            "button{margin-top:18px;background:#f97316;color:#09090b;border:0;border-radius:12px;" +
            "padding:12px 22px;font-size:14px;font-weight:700;cursor:pointer}</style></head><body>" +
            "<div class=\"c\"><h1>Signing you in…</h1>" +
            "<p id=\"msg\">Returning to IsotopeAI…</p>" +
            "<button id=\"retry\" style=\"display:none\" onclick=\"location.href='isotopeai://auth/callback'+location.hash\">Open app</button>" +
                "<script>(function(){var h=location.hash||'';if(!/[&#]access_token=/.test(h)&&!/[&#]code=/.test(h)){" +
                "document.getElementById('msg').textContent='No sign-in tokens found in this URL.';" +
                "document.getElementById('retry').style.display='none';return;}" +
                "try{fetch('/__oauth/consumed',{method:'POST'}).catch(function(){});}catch(e){}" +
                "var f=document.createElement('iframe');f.style.display='none';" +
                "f.src='isotopeai://auth/callback'+h;document.body.appendChild(f);" +
                "setTimeout(function(){location.replace('isotopeai://auth/callback'+h);},300);" +
                "setTimeout(function(){if(!document.hidden){document.getElementById('retry').style.display='inline-block';" +
                "document.getElementById('msg').textContent='Tap Open app if it did not open automatically.';}},1500);" +
                "})();</script></div></body></html>";
    }

    private static String oauthDoneHtml() {
        return "<!doctype html><html><head><meta charset=\"utf-8\">" +
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
            "<style>body{font-family:system-ui;background:#09090b;color:#e4e4e7;display:flex;" +
            "align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}" +
            ".c{max-width:420px;padding:32px}h1{font-size:20px;font-weight:800;color:#22c55e}" +
            "p{color:#a1a1aa;font-size:14px;line-height:1.6}</style></head><body>" +
            "<div class=\"c\"><h1>Signed in</h1>" +
            "<p>Sign-in complete. You can close this page and return to IsotopeAI.</p>" +
            "</div></body></html>";
    }
}
