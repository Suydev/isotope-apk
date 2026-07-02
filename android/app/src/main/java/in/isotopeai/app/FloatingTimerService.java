package in.isotopeai.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

public class FloatingTimerService extends Service {
    public static final String ACTION_START = "in.isotopeai.app.action.FLOATING_TIMER_START";
    public static final String ACTION_UPDATE = "in.isotopeai.app.action.FLOATING_TIMER_UPDATE";
    public static final String ACTION_STOP = "in.isotopeai.app.action.FLOATING_TIMER_STOP";
    public static final String EXTRA_STATE_JSON = "state_json";

    private static final int NOTIFICATION_ID = 4107;
    private static final String CHANNEL_ID = "isotope-floating-timer";
    private static final String PREF_X = "overlay_x";
    private static final String PREF_Y = "overlay_y";
    private static final String PREF_WIDTH = "overlay_width";
    private static final String PREF_HEIGHT = "overlay_height";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private WindowManager windowManager;
    private WindowManager.LayoutParams layoutParams;
    private View rootView;
    private LinearLayout cardView;
    private LinearLayout questionSection;
    private LinearLayout targetEditorRow;
    private TextView headingText;
    private TextView timerText;
    private TextView statusDot;
    private TextView statusText;
    private TextView focusTypeText;
    private TextView attemptedText;
    private TextView targetValueText;
    private Button correctButton;
    private Button incorrectButton;
    private Button skippedButton;
    private Button undoButton;
    private Button targetButton;
    private TimerState state = TimerState.idle();
    private boolean foregroundStarted = false;
    private boolean dragging = false;
    private boolean resizing = false;
    private float touchStartX = 0;
    private float touchStartY = 0;
    private int windowStartX = 0;
    private int windowStartY = 0;
    private int resizeStartWidth = 0;
    private int resizeStartHeight = 0;

    private final Runnable tickRunnable = new Runnable() {
        @Override
        public void run() {
            if (state == null || !state.isActive()) {
                stopSelf();
                return;
            }
            renderDynamicFields();
            handler.postDelayed(this, 500);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : ACTION_UPDATE;
        if (ACTION_STOP.equals(action)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String stateJson = intent != null ? intent.getStringExtra(EXTRA_STATE_JSON) : null;
        TimerState nextState = TimerState.fromJson(stateJson);
        if (!nextState.isActive()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        state = nextState;

        if (!hasOverlayPermission()) {
            stopSelf();
            return START_NOT_STICKY;
        }

        ensureForeground();
        ensureOverlay();
        renderAll();
        handler.removeCallbacks(tickRunnable);
        handler.post(tickRunnable);
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        removeOverlay();
        foregroundStarted = false;
        super.onDestroy();
    }

    private boolean hasOverlayPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this);
    }

    private void ensureForeground() {
        if (foregroundStarted) {
            return;
        }
        startForeground(NOTIFICATION_ID, buildNotification());
        foregroundStarted = true;
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            this,
            4108,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        return builder
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Floating Timer")
            .setContentText("IsotopeAI focus timer is running")
            .setContentIntent(contentIntent)
            .setOngoing(true)
            .setShowWhen(false)
            .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Floating Timer",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Keeps the IsotopeAI Floating Timer active.");
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }

    private void ensureOverlay() {
        if (rootView != null) {
            return;
        }
        buildOverlayView();
        SharedPreferences prefs = getSharedPreferences(MainActivity.PREFS_FLOATING_TIMER, MODE_PRIVATE);
        layoutParams = new WindowManager.LayoutParams(
            clampOverlayWidth(prefs.getInt(PREF_WIDTH, dp(340))),
            clampOverlayHeight(prefs.getInt(PREF_HEIGHT, dp(390))),
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        );
        layoutParams.gravity = Gravity.TOP | Gravity.START;
        layoutParams.x = prefs.getInt(PREF_X, dp(18));
        layoutParams.y = prefs.getInt(PREF_Y, dp(72));
        try {
            windowManager.addView(rootView, layoutParams);
        } catch (Exception error) {
            rootView = null;
            stopSelf();
        }
    }

    private void removeOverlay() {
        if (rootView != null && windowManager != null) {
            try {
                windowManager.removeView(rootView);
            } catch (Exception ignored) {
            }
        }
        rootView = null;
    }

    private void buildOverlayView() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.TRANSPARENT);
        root.setPadding(0, 0, 0, 0);

        cardView = new LinearLayout(this);
        cardView.setOrientation(LinearLayout.VERTICAL);
        cardView.setPadding(dp(18), dp(16), dp(18), dp(20));
        cardView.setOnTouchListener(this::handleDragTouch);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);

        headingText = makeText(14, true);
        headingText.setLetterSpacing(0.04f);
        LinearLayout.LayoutParams headingParams = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        header.addView(headingText, headingParams);
        header.addView(makeIconButton("↗", () -> {
            dispatchAction("expand", -1);
            openMainActivity();
            stopSelf();
        }));
        header.addView(makeIconButton("×", () -> {
            dispatchAction("close", -1);
            stopSelf();
        }));

        timerText = makeText(52, true);
        timerText.setGravity(Gravity.CENTER);
        timerText.setTypeface(Typeface.DEFAULT, Typeface.BOLD);

        LinearLayout statusRow = new LinearLayout(this);
        statusRow.setGravity(Gravity.CENTER);
        statusRow.setOrientation(LinearLayout.HORIZONTAL);
        statusDot = makeText(16, true);
        statusText = makeText(14, true);
        statusRow.addView(statusDot);
        statusRow.addView(statusText);

        focusTypeText = makeText(14, true);
        focusTypeText.setGravity(Gravity.CENTER);

        questionSection = new LinearLayout(this);
        questionSection.setOrientation(LinearLayout.VERTICAL);
        questionSection.setPadding(0, dp(8), 0, 0);

        LinearLayout attemptRow = new LinearLayout(this);
        attemptRow.setGravity(Gravity.CENTER_VERTICAL);
        attemptRow.setOrientation(LinearLayout.HORIZONTAL);
        attemptedText = makeText(28, true);
        targetButton = makePillButton("Target");
        targetButton.setOnClickListener(v -> showTargetDialog());
        attemptRow.addView(attemptedText, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        attemptRow.addView(targetButton);

        targetValueText = makeText(13, true);
        targetEditorRow = new LinearLayout(this);
        targetEditorRow.setGravity(Gravity.CENTER);
        targetEditorRow.setOrientation(LinearLayout.HORIZONTAL);
        Button minus = makePillButton("-5");
        Button plus = makePillButton("+5");
        Button zero = makePillButton("0");
        minus.setOnClickListener(v -> updateTargetBy(-5));
        plus.setOnClickListener(v -> updateTargetBy(5));
        zero.setOnClickListener(v -> setTarget(0));
        targetEditorRow.addView(minus);
        targetEditorRow.addView(targetValueText);
        targetEditorRow.addView(plus);
        targetEditorRow.addView(zero);
        targetEditorRow.setVisibility(View.GONE);

        LinearLayout resultRow = new LinearLayout(this);
        resultRow.setOrientation(LinearLayout.HORIZONTAL);
        resultRow.setGravity(Gravity.CENTER);
        correctButton = makeResultButton("Correct");
        incorrectButton = makeResultButton("Incorrect");
        skippedButton = makeResultButton("Skip");
        correctButton.setOnClickListener(v -> dispatchAction("correct", -1));
        incorrectButton.setOnClickListener(v -> dispatchAction("incorrect", -1));
        skippedButton.setOnClickListener(v -> dispatchAction("skipped", -1));
        resultRow.addView(correctButton, new LinearLayout.LayoutParams(0, dp(42), 1f));
        resultRow.addView(incorrectButton, new LinearLayout.LayoutParams(0, dp(42), 1f));
        resultRow.addView(skippedButton, new LinearLayout.LayoutParams(0, dp(42), 1f));

        undoButton = makePillButton("Undo last");
        undoButton.setOnClickListener(v -> dispatchAction("undo", -1));

        questionSection.addView(attemptRow);
        questionSection.addView(targetEditorRow);
        questionSection.addView(resultRow);
        questionSection.addView(undoButton);

        cardView.addView(header);
        cardView.addView(timerText);
        cardView.addView(statusRow);
        cardView.addView(focusTypeText);
        cardView.addView(questionSection);
        root.addView(cardView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        TextView resizeHandle = makeText(20, true);
        resizeHandle.setText("◢");
        resizeHandle.setGravity(Gravity.CENTER);
        resizeHandle.setTextColor(Color.argb(150, 255, 255, 255));
        resizeHandle.setOnTouchListener(this::handleResizeTouch);
        FrameLayout.LayoutParams resizeParams = new FrameLayout.LayoutParams(dp(44), dp(44), Gravity.BOTTOM | Gravity.RIGHT);
        root.addView(resizeHandle, resizeParams);
        rootView = root;
    }

    private boolean handleDragTouch(View view, MotionEvent event) {
        if (layoutParams == null || windowManager == null) {
            return false;
        }
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                dragging = false;
                touchStartX = event.getRawX();
                touchStartY = event.getRawY();
                windowStartX = layoutParams.x;
                windowStartY = layoutParams.y;
                return true;
            case MotionEvent.ACTION_MOVE:
                int dx = Math.round(event.getRawX() - touchStartX);
                int dy = Math.round(event.getRawY() - touchStartY);
                if (Math.abs(dx) > dp(3) || Math.abs(dy) > dp(3)) {
                    dragging = true;
                    layoutParams.x = windowStartX + dx;
                    layoutParams.y = Math.max(0, windowStartY + dy);
                    try {
                        windowManager.updateViewLayout(rootView, layoutParams);
                    } catch (Exception ignored) {
                    }
                }
                return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                if (dragging) {
                    getSharedPreferences(MainActivity.PREFS_FLOATING_TIMER, MODE_PRIVATE)
                        .edit()
                        .putInt(PREF_X, layoutParams.x)
                        .putInt(PREF_Y, layoutParams.y)
                        .apply();
                }
                dragging = false;
                return false;
            default:
                return false;
        }
    }

    private boolean handleResizeTouch(View view, MotionEvent event) {
        if (layoutParams == null || windowManager == null) {
            return false;
        }
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                resizing = true;
                touchStartX = event.getRawX();
                touchStartY = event.getRawY();
                resizeStartWidth = layoutParams.width;
                resizeStartHeight = layoutParams.height;
                return true;
            case MotionEvent.ACTION_MOVE:
                if (!resizing) {
                    return true;
                }
                int dx = Math.round(event.getRawX() - touchStartX);
                int dy = Math.round(event.getRawY() - touchStartY);
                layoutParams.width = clampOverlayWidth(resizeStartWidth + dx);
                layoutParams.height = clampOverlayHeight(resizeStartHeight + dy);
                try {
                    windowManager.updateViewLayout(rootView, layoutParams);
                } catch (Exception ignored) {
                }
                return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                if (resizing) {
                    getSharedPreferences(MainActivity.PREFS_FLOATING_TIMER, MODE_PRIVATE)
                        .edit()
                        .putInt(PREF_WIDTH, layoutParams.width)
                        .putInt(PREF_HEIGHT, layoutParams.height)
                        .apply();
                }
                resizing = false;
                return true;
            default:
                return false;
        }
    }

    private void renderAll() {
        if (cardView == null || state == null) {
            return;
        }
        boolean dark = "dark".equals(state.theme);
        int cardColor = dark ? Color.rgb(24, 24, 27) : Color.rgb(250, 250, 250);
        int textColor = dark ? Color.WHITE : Color.rgb(24, 24, 27);
        int mutedColor = dark ? Color.rgb(212, 212, 216) : Color.rgb(82, 82, 91);

        GradientDrawable cardBackground = new GradientDrawable();
        cardBackground.setColor(cardColor);
        cardBackground.setCornerRadius(dp(26));
        cardBackground.setStroke(dp(1), dark ? Color.argb(45, 255, 255, 255) : Color.argb(45, 24, 24, 27));
        cardView.setBackground(cardBackground);

        applyTextColor(cardView, textColor);
        statusText.setTextColor(mutedColor);
        focusTypeText.setTextColor(mutedColor);
        targetValueText.setTextColor(mutedColor);
        headingText.setText(state.mode.equals("stopwatch") ? "Stopwatch" : "Pomodoro");
        questionSection.setVisibility(state.showQuestionControls ? View.VISIBLE : View.GONE);
        styleButton(targetButton, dark ? Color.argb(18, 255, 255, 255) : Color.argb(205, 255, 255, 255), textColor, dark ? Color.argb(42, 255, 255, 255) : Color.argb(42, 24, 24, 27));
        styleButton(correctButton, Color.rgb(5, 150, 105), Color.WHITE, Color.TRANSPARENT);
        styleButton(incorrectButton, Color.rgb(225, 29, 72), Color.WHITE, Color.TRANSPARENT);
        styleButton(skippedButton, Color.rgb(217, 119, 6), Color.WHITE, Color.TRANSPARENT);
        styleButton(undoButton, Color.TRANSPARENT, mutedColor, dark ? Color.argb(36, 255, 255, 255) : Color.argb(36, 24, 24, 27));
        renderDynamicFields();
    }

    private void renderDynamicFields() {
        if (state == null || timerText == null) {
            return;
        }
        int seconds = state.displaySecondsNow();
        timerText.setText(formatSeconds(seconds));
        statusText.setText("  " + state.statusLabel());
        statusDot.setText("●");
        statusDot.setTextColor(state.statusColor());
        focusTypeText.setText(state.focusTypeIcon + " " + state.focusTypeLabel);
        attemptedText.setText(String.valueOf(state.questionsAttempted) + (state.targetQuestions > 0 ? " / " + state.targetQuestions : ""));
        targetValueText.setText("  Target " + state.targetQuestions + "  ");
        correctButton.setText("✓ " + state.questionsCorrect);
        incorrectButton.setText("✕ " + state.questionsIncorrect);
        skippedButton.setText("Skip " + state.questionsSkipped);
        undoButton.setEnabled(state.undoAvailable);
        undoButton.setAlpha(state.undoAvailable ? 1f : 0.45f);
        if (!state.isActive()) {
            stopSelf();
        }
    }

    private void updateTargetBy(int delta) {
        setTarget(Math.max(0, Math.min(9999, state.targetQuestions + delta)));
    }

    private void showTargetDialog() {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_NUMBER);
        input.setSingleLine(true);
        input.setText(state.targetQuestions > 0 ? String.valueOf(state.targetQuestions) : "");
        input.setSelectAllOnFocus(true);
        int padding = dp(20);
        input.setPadding(padding, dp(12), padding, dp(12));

        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("Set target questions")
            .setView(input)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Set", (d, which) -> {
                int value = 0;
                try {
                    value = Integer.parseInt(input.getText().toString().trim());
                } catch (Exception ignored) {
                }
                setTarget(Math.max(0, Math.min(9999, value)));
            })
            .create();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && dialog.getWindow() != null) {
            dialog.getWindow().setType(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY);
        }
        dialog.setOnShowListener(d -> {
            if (dialog.getWindow() != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                dialog.getWindow().setType(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY);
            }
            input.requestFocus();
        });
        try {
            dialog.show();
        } catch (Exception ignored) {
            updateTargetBy(5);
        }
    }

    private void setTarget(int value) {
        state.targetQuestions = Math.max(0, Math.min(9999, value));
        dispatchAction("setTarget", state.targetQuestions);
        renderDynamicFields();
    }

    private void dispatchAction(String type, int value) {
        MainActivity.enqueueFloatingTimerAction(getApplicationContext(), type, value);
    }

    private void openMainActivity() {
        Intent intent = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
    }

    private TextView makeText(int sp, boolean bold) {
        TextView view = new TextView(this);
        view.setTextSize(sp);
        view.setIncludeFontPadding(true);
        if (bold) {
            view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        }
        return view;
    }

    private Button makeIconButton(String text, Runnable action) {
        Button button = makePillButton(text);
        button.setTextSize(18);
        button.setOnClickListener(v -> action.run());
        return button;
    }

    private Button makeResultButton(String text) {
        Button button = makePillButton(text);
        button.setTextSize(13);
        return button;
    }

    private Button makePillButton(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setAllCaps(false);
        button.setTextSize(12);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setTextColor(Color.WHITE);
        button.setPadding(dp(8), 0, dp(8), 0);
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.rgb(249, 115, 22));
        background.setCornerRadius(dp(999));
        button.setBackground(background);
        return button;
    }

    private void styleButton(Button button, int backgroundColor, int textColor, int strokeColor) {
        if (button == null) {
            return;
        }
        GradientDrawable background = new GradientDrawable();
        background.setColor(backgroundColor);
        background.setCornerRadius(dp(999));
        if (strokeColor != Color.TRANSPARENT) {
            background.setStroke(dp(1), strokeColor);
        }
        button.setTextColor(textColor);
        button.setBackground(background);
    }

    private void applyTextColor(View view, int color) {
        if (view instanceof TextView) {
            ((TextView) view).setTextColor(color);
        }
        if (view instanceof Button) {
            ((Button) view).setTextColor(Color.WHITE);
        }
        if (view instanceof LinearLayout) {
            LinearLayout group = (LinearLayout) view;
            for (int i = 0; i < group.getChildCount(); i += 1) {
                applyTextColor(group.getChildAt(i), color);
            }
        } else if (view instanceof FrameLayout) {
            FrameLayout group = (FrameLayout) view;
            for (int i = 0; i < group.getChildCount(); i += 1) {
                applyTextColor(group.getChildAt(i), color);
            }
        }
    }

    private String formatSeconds(int totalSeconds) {
        int seconds = Math.max(0, totalSeconds);
        int days = seconds / 86400;
        int hours = (seconds % 86400) / 3600;
        int minutes = (seconds % 3600) / 60;
        int secs = seconds % 60;
        if (days > 0) {
            return days + "d " + hours + ":" + two(minutes) + ":" + two(secs);
        }
        if (hours > 0) {
            return hours + ":" + two(minutes) + ":" + two(secs);
        }
        return minutes + ":" + two(secs);
    }

    private String two(int value) {
        return value < 10 ? "0" + value : String.valueOf(value);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private int clampOverlayWidth(int value) {
        int screenWidth = getResources().getDisplayMetrics().widthPixels;
        int max = Math.max(dp(320), Math.min(dp(560), screenWidth - dp(24)));
        return Math.max(dp(280), Math.min(max, value));
    }

    private int clampOverlayHeight(int value) {
        int screenHeight = getResources().getDisplayMetrics().heightPixels;
        int max = Math.max(dp(360), Math.min(dp(720), screenHeight - dp(24)));
        return Math.max(dp(300), Math.min(max, value));
    }

    private static class TimerState {
        String mode = "pomodoro";
        String timerState = "idle";
        String activePhase = "";
        long completionAtMs = 0;
        long updatedAtMs = System.currentTimeMillis();
        int displayedSeconds = 0;
        int totalSeconds = 0;
        String focusTypeLabel = "Focus";
        String focusTypeIcon = "📌";
        boolean showQuestionControls = false;
        int questionsAttempted = 0;
        int questionsCorrect = 0;
        int questionsIncorrect = 0;
        int questionsSkipped = 0;
        int targetQuestions = 0;
        boolean undoAvailable = false;
        String theme = "dark";

        static TimerState idle() {
            return new TimerState();
        }

        static TimerState fromJson(String json) {
            TimerState state = new TimerState();
            if (json == null || json.trim().isEmpty()) {
                return state;
            }
            try {
                JSONObject object = new JSONObject(json);
                state.mode = "stopwatch".equals(object.optString("mode")) ? "stopwatch" : "pomodoro";
                String rawTimerState = object.optString("timerState", "idle");
                state.timerState = isTimerState(rawTimerState) ? rawTimerState : "idle";
                state.activePhase = object.optString("activePhase", "");
                state.completionAtMs = Math.max(0, object.optLong("completionAtMs", 0));
                state.updatedAtMs = Math.max(0, object.optLong("updatedAtMs", System.currentTimeMillis()));
                state.displayedSeconds = clamp(object.optInt("displayedSeconds", 0), 0, 365 * 24 * 3600);
                state.totalSeconds = clamp(object.optInt("totalSeconds", state.displayedSeconds), 0, 365 * 24 * 3600);
                state.focusTypeLabel = cleanText(object.optString("focusTypeLabel", "Focus"), 48, "Focus");
                state.focusTypeIcon = cleanText(object.optString("focusTypeIcon", "📌"), 8, "📌");
                state.showQuestionControls = object.optBoolean("showQuestionControls", false);
                state.questionsAttempted = clamp(object.optInt("questionsAttempted", 0), 0, 999999);
                state.questionsCorrect = clamp(object.optInt("questionsCorrect", 0), 0, 999999);
                state.questionsIncorrect = clamp(object.optInt("questionsIncorrect", 0), 0, 999999);
                state.questionsSkipped = clamp(object.optInt("questionsSkipped", 0), 0, 999999);
                state.targetQuestions = clamp(object.optInt("targetQuestions", 0), 0, 9999);
                state.undoAvailable = object.optBoolean("undoAvailable", false);
                state.theme = "light".equals(object.optString("theme")) ? "light" : "dark";
            } catch (Exception ignored) {
            }
            return state;
        }

        boolean isActive() {
            if (!("running".equals(timerState) || "paused".equals(timerState) || "break".equals(timerState))) {
                return false;
            }
            return "stopwatch".equals(mode) || displaySecondsNow() > 0 || "paused".equals(timerState);
        }

        int displaySecondsNow() {
            long now = System.currentTimeMillis();
            if (("running".equals(timerState) || "break".equals(timerState)) && "stopwatch".equals(mode)) {
                return clamp(displayedSeconds + (int) Math.max(0, (now - updatedAtMs) / 1000), 0, 365 * 24 * 3600);
            }
            if (("running".equals(timerState) || "break".equals(timerState)) && completionAtMs > 0) {
                return clamp((int) Math.ceil(Math.max(0, completionAtMs - now) / 1000.0), 0, 365 * 24 * 3600);
            }
            return displayedSeconds;
        }

        String statusLabel() {
            if ("running".equals(timerState)) return "Focusing...";
            if ("paused".equals(timerState)) return "Paused";
            if ("break".equals(timerState) || "break".equals(activePhase)) return "Break";
            return "Idle";
        }

        int statusColor() {
            if ("running".equals(timerState)) return Color.rgb(34, 197, 94);
            if ("paused".equals(timerState)) return Color.rgb(245, 158, 11);
            if ("break".equals(timerState) || "break".equals(activePhase)) return Color.rgb(59, 130, 246);
            return Color.rgb(113, 113, 122);
        }

        private static boolean isTimerState(String value) {
            return "idle".equals(value) || "running".equals(value) || "paused".equals(value) || "break".equals(value);
        }

        private static int clamp(int value, int min, int max) {
            return Math.max(min, Math.min(max, value));
        }

        private static String cleanText(String value, int max, String fallback) {
            if (value == null) {
                return fallback;
            }
            String text = value.trim();
            if (text.isEmpty()) {
                return fallback;
            }
            return text.length() > max ? text.substring(0, max) : text;
        }
    }
}
