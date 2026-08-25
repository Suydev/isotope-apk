/**
 * IsotopeAI Android Floating Timer bridge.
 *
 * This bridge does not emulate browser Document Picture-in-Picture. Android
 * system PiP cannot host directly clickable app UI, so the Android build uses a
 * native overlay service for the interactive focus timer card.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.__ISO_IS_ANDROID__) return;

  var FALLBACK_ICONS = {
    theory: '📚',
    questions: '❓',
    lecture: '🎓',
    revision: '📝',
    practice: '💪',
    other: '📌'
  };
  var PROFILE_KEY = 'isotope_user_profile_v2';
  var activeController = null;
  var unsubscribeStore = null;
  var stateTimer = null;

  function nativeBridge() {
    try { return window.IsotopeAndroid || null; }
    catch (error) { return null; }
  }

  function clampNumber(value, min, max, fallback) {
    var n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(n)));
  }

  function hasUnpairedSurrogate(value) {
    for (var i = 0; i < value.length; i += 1) {
      var code = value.charCodeAt(i);
      if (code >= 0xD800 && code <= 0xDBFF) {
        var next = value.charCodeAt(i + 1);
        if (!(next >= 0xDC00 && next <= 0xDFFF)) return true;
        i += 1;
      } else if (code >= 0xDC00 && code <= 0xDFFF) {
        return true;
      }
    }
    return false;
  }

  function isControlOnly(value) {
    var sawPrintable = false;
    for (var i = 0; i < value.length; i += 1) {
      var code = value.charCodeAt(i);
      if (code > 0x20 && !(code >= 0x7F && code <= 0x9F)) {
        sawPrintable = true;
        break;
      }
    }
    return !sawPrintable;
  }

  function firstGrapheme(value) {
    if (!value) return '';
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      try {
        var segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        var iterator = segmenter.segment(value)[Symbol.iterator]();
        var first = iterator.next();
        return first && first.value && first.value.segment ? first.value.segment : '';
      } catch (error) {}
    }
    return Array.from(value)[0] || '';
  }

  function fallbackIcon(id) {
    var key = String(id || '').trim().toLowerCase();
    return FALLBACK_ICONS[key] || FALLBACK_ICONS.other;
  }

  function normalizeFocusIcon(icon, id) {
    var raw = typeof icon === 'string' ? icon.trim() : '';
    if (
      !raw ||
      raw.indexOf('\uFFFD') !== -1 ||
      raw.indexOf('ï¿½') !== -1 ||
      hasUnpairedSurrogate(raw) ||
      isControlOnly(raw)
    ) {
      return fallbackIcon(id);
    }
    var grapheme = firstGrapheme(raw);
    if (
      !grapheme ||
      grapheme.indexOf('\uFFFD') !== -1 ||
      grapheme.indexOf('ï¿½') !== -1 ||
      hasUnpairedSurrogate(grapheme) ||
      isControlOnly(grapheme)
    ) {
      return fallbackIcon(id);
    }
    return grapheme;
  }

  function repairFocusTypesInProfile(profile) {
    if (!profile || typeof profile !== 'object') return { profile: profile, changed: false };
    var settings = profile.focusSettings;
    var types = settings && Array.isArray(settings.focusTypes) ? settings.focusTypes : null;
    if (!types) return { profile: profile, changed: false };

    var changed = false;
    var nextTypes = types.map(function (type) {
      if (!type || typeof type !== 'object') return type;
      var nextIcon = normalizeFocusIcon(type.icon, type.id);
      if (nextIcon === type.icon) return type;
      changed = true;
      return Object.assign({}, type, { icon: nextIcon });
    });
    if (!changed) return { profile: profile, changed: false };

    return {
      changed: true,
      profile: Object.assign({}, profile, {
        focusSettings: Object.assign({}, settings, { focusTypes: nextTypes })
      })
    };
  }

  function repairStoredFocusIconsOnce() {
    try {
      if (!window.localStorage) return { changed: false };
      var raw = window.localStorage.getItem(PROFILE_KEY);
      if (!raw) return { changed: false };
      var parsed = JSON.parse(raw);
      var repaired = repairFocusTypesInProfile(parsed);
      if (!repaired.changed) return { changed: false };
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(repaired.profile));
      return { changed: true };
    } catch (error) {
      return { changed: false, error: error && error.message || 'repair failed' };
    }
  }

  function stopStatePump() {
    if (stateTimer !== null) {
      clearInterval(stateTimer);
      stateTimer = null;
    }
    if (typeof unsubscribeStore === 'function') {
      try { unsubscribeStore(); } catch (error) {}
      unsubscribeStore = null;
    }
  }

  function isActiveTimerState(state) {
    return !!state && (state.timerState === 'running' || state.timerState === 'paused' || state.timerState === 'break');
  }

  function normalizeTimerState(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var mode = raw.mode === 'stopwatch' ? 'stopwatch' : 'pomodoro';
    var timerState = ['idle', 'running', 'paused', 'break'].indexOf(raw.timerState) >= 0 ? raw.timerState : 'idle';
    var activePhase = raw.activePhase === 'break' ? 'break' : raw.activePhase === 'focus' ? 'focus' : null;
    var displayedSeconds = clampNumber(raw.displayedSeconds, 0, 365 * 24 * 3600, 0);
    var totalSeconds = clampNumber(raw.totalSeconds, 0, 365 * 24 * 3600, displayedSeconds);
    var targetQuestions = clampNumber(raw.targetQuestions, 0, 9999, 0);
    var now = Date.now();
    var completionAtMs = raw.completionAtMs ? clampNumber(raw.completionAtMs, 0, 9999999999999, 0) : 0;
    var updatedAtMs = raw.updatedAtMs ? clampNumber(raw.updatedAtMs, 0, 9999999999999, now) : now;
    var focusTypeId = String(raw.focusTypeId || raw.taskType || raw.sessionType || 'other').trim().toLowerCase() || 'other';
    var focusTypeLabel = String(raw.focusTypeLabel || raw.taskType || raw.sessionType || 'Focus').trim().slice(0, 48) || 'Focus';

    return {
      mode: mode,
      timerState: timerState,
      activePhase: activePhase,
      startedAt: raw.startedAt || null,
      completionAtMs: completionAtMs || null,
      updatedAtMs: updatedAtMs,
      displayedSeconds: displayedSeconds,
      totalSeconds: totalSeconds,
      sessionType: String(raw.sessionType || '').slice(0, 64),
      taskType: String(raw.taskType || '').slice(0, 64),
      focusTypeId: focusTypeId,
      focusTypeLabel: focusTypeLabel,
      focusTypeIcon: normalizeFocusIcon(raw.focusTypeIcon, focusTypeId),
      questionTrackingEnabled: raw.questionTrackingEnabled !== false,
      trackQuestions: !!raw.trackQuestions,
      showQuestionControls: !!raw.showQuestionControls,
      questionsAttempted: clampNumber(raw.questionsAttempted, 0, 999999, 0),
      questionsCorrect: clampNumber(raw.questionsCorrect, 0, 999999, 0),
      questionsIncorrect: clampNumber(raw.questionsIncorrect, 0, 999999, 0),
      questionsSkipped: clampNumber(raw.questionsSkipped, 0, 999999, 0),
      targetQuestions: targetQuestions,
      undoAvailable: !!raw.undoAvailable,
      pomodoroCycle: clampNumber(raw.pomodoroCycle, 1, 999, 1),
      pomodoroSessionsUntilLongBreak: clampNumber(raw.pomodoroSessionsUntilLongBreak, 1, 99, 4),
      theme: raw.theme === 'light' ? 'light' : 'dark',
      route: raw.route || '/focus',
      active: timerState === 'running' || timerState === 'paused' || timerState === 'break'
    };
  }

  function getControllerState() {
    if (!activeController || typeof activeController.getState !== 'function') return null;
    try { return normalizeTimerState(activeController.getState()); }
    catch (error) {
      console.error('[IsotopeAI Floating Timer] Failed to read timer state:', error);
      return null;
    }
  }

  function sendStateToNative() {
    var state = getControllerState();
    if (!state) return false;
    if (!isActiveTimerState(state)) {
      var __b0 = nativeBridge();
      try { if (__b0 && typeof __b0.stopFloatingTimer === 'function') __b0.stopFloatingTimer(); } catch (error) {}
      stopStatePump();
      activeController = null;
      return false;
    }
    var payload = JSON.stringify(state);
    try { if (window.__isoPipCache && window.__isoPipCache.set) window.__isoPipCache.set(state); } catch (e) {}
    try { fetch('http://127.0.0.1:3000/__pip/state', { method:'POST', headers:{'Content-Type':'application/json'}, body:payload, keepalive:true }).catch(function(){}); } catch (e) {}
    var bridge = nativeBridge();
    if (!bridge) return true;
    try {
      if (typeof bridge.updateFloatingTimerState === 'function') bridge.updateFloatingTimerState(payload);
      return true;
    } catch (error) {
      console.error('[IsotopeAI Floating Timer] Native state update failed:', error);
      return true;
    }
  }

  function startStatePump() {
    stopStatePump();
    if (activeController && typeof activeController.subscribe === 'function') {
      try { unsubscribeStore = activeController.subscribe(sendStateToNative); } catch (error) {}
    }
    stateTimer = setInterval(sendStateToNative, 1000);
  }

  function validateAction(input) {
    var type = typeof input === 'string' ? input : input && input.type;
    if (['correct', 'incorrect', 'skipped', 'undo', 'expand', 'close', 'pause', 'resume', 'togglePause'].indexOf(type) >= 0) {
      return { type: type };
    }
    if (type === 'setTarget') {
      return { type: 'setTarget', value: clampNumber(input && input.value, 0, 9999, 0) };
    }
    return null;
  }

  function dispatchToStore(action) {
    if (!activeController) return false;
    try {
      if (typeof activeController.dispatch === 'function') return activeController.dispatch(action) !== false;
      var st = typeof activeController.getState === 'function' ? activeController.getState() : null;
      if (!st) return false;
      if (action.type === 'correct' && typeof st.recordQuestionResult === 'function') { st.recordQuestionResult('correct'); return true; }
      if (action.type === 'incorrect' && typeof st.recordQuestionResult === 'function') { st.recordQuestionResult('incorrect'); return true; }
      if (action.type === 'skipped' && typeof st.recordQuestionResult === 'function') { st.recordQuestionResult('skipped'); return true; }
      if (action.type === 'undo' && typeof st.undoLastQuestionResult === 'function') { st.undoLastQuestionResult(); return true; }
      if (action.type === 'setTarget' && typeof st.setTargetQuestions === 'function') { st.setTargetQuestions(action.value); return true; }
      if (typeof st.dispatch === 'function') return st.dispatch(action) !== false;
      return false;
    } catch (error) {
      console.error('[IsotopeAI Floating Timer] Action dispatch failed:', error);
      return false;
    }
  }

  window.__isoNormalizeFocusIcon = normalizeFocusIcon;
  window.__isoRepairFocusTypesInProfile = repairFocusTypesInProfile;
  window.__isoRepairStoredFocusIconsOnce = repairStoredFocusIconsOnce;

  function discoverController() {
    if (activeController && typeof activeController.getState === 'function') return activeController;
    try {
      if (window.__isoFocusController && typeof window.__isoFocusController.getState === 'function') {
        activeController = window.__isoFocusController; return activeController;
      }
      if (window.__FOCUS_STORE__ && typeof window.__FOCUS_STORE__.getState === 'function') {
        activeController = window.__FOCUS_STORE__; return activeController;
      }
      var keys = Object.keys(window);
      for (var i = 0; i < keys.length; i++) {
        try {
          var v = window[keys[i]];
          if (v && typeof v.getState === 'function' && typeof v.dispatch === 'function') {
            var st = v.getState();
            if (st && ('timerState' in st || 'mode' in st || 'timeLeft' in st || 'stopwatchTime' in st)) {
              activeController = v; window.__isoFocusController = v; return v;
            }
          }
          if (v && v.useFocusStore && typeof v.useFocusStore.getState === 'function') {
            activeController = v.useFocusStore; window.__isoFocusController = activeController; return activeController;
          }
        } catch (e) {}
      }
    } catch (e) {}
    return null;
  }
  window.__isoRegisterFocusController = function (c) {
    if (c && typeof c.getState === 'function') { activeController = c; window.__isoFocusController = c; }
    return c;
  };
  window.__isoGetFocusController = discoverController;

  window.__ISO_FLOATING_TIMER__ = {
    normalizeTimerState: normalizeTimerState,
    handleNativeAction: function (input) {
      var action = validateAction(input);
      var bridge = nativeBridge();
      if (!action) return false;
      if (action.type === 'expand') {
        try {
          if (bridge && typeof bridge.expandFloatingTimer === 'function') bridge.expandFloatingTimer();
          if (window.location && window.location.pathname !== '/focus') window.history.pushState(null, '', '/focus');
        } catch (error) {}
        return true;
      }
      if (action.type === 'close') {
        try { if (bridge && typeof bridge.stopFloatingTimer === 'function') bridge.stopFloatingTimer(); } catch (error) {}
        stopStatePump();
        activeController = null;
        return true;
      }
      if (action.type === 'pause' || action.type === 'resume' || action.type === 'togglePause') {
        if (!dispatchToStore(action)) {
          try { if (activeController && typeof activeController.toggleTimer === 'function') activeController.toggleTimer(); } catch (e) { return false; }
        }
        setTimeout(sendStateToNative, 0);
        return true;
      }
      if (!dispatchToStore(action)) return false;
      setTimeout(sendStateToNative, 0);
      return true;
    },
    close: function () {
      var bridge = nativeBridge();
      try { if (bridge && typeof bridge.stopFloatingTimer === 'function') bridge.stopFloatingTimer(); } catch (error) {}
      stopStatePump();
      activeController = null;
    },
    sendState: sendStateToNative
  };

  window.__isoOpenFloatingTimer = function (controller) {
    var bridge = nativeBridge();
    if (!bridge || typeof bridge.startFloatingTimer !== 'function') {
      return Promise.resolve({ ok: false, reason: 'Android Floating Timer bridge is unavailable.' });
    }
    if (!controller || typeof controller.getState !== 'function' || typeof controller.dispatch !== 'function') {
      return Promise.resolve({ ok: false, reason: 'Focus timer state is not ready.' });
    }

    activeController = controller;
    var state = getControllerState();
    if (!isActiveTimerState(state)) {
      activeController = null;
      return Promise.resolve({ ok: false, reason: 'Start a focus session before opening Floating Timer.' });
    }

    try {
      if (typeof bridge.hasOverlayPermission === 'function' && !bridge.hasOverlayPermission()) {
        if (typeof bridge.requestOverlayPermission === 'function') bridge.requestOverlayPermission();
        activeController = null;
        return Promise.resolve({
          ok: false,
          permissionRequired: true,
          reason: 'Enable Display over other apps for IsotopeAI, then open Floating Timer again.'
        });
      }
      bridge.startFloatingTimer(JSON.stringify(state));
      startStatePump();
      if (typeof bridge.replayFloatingTimerActions === 'function') bridge.replayFloatingTimerActions();
      return Promise.resolve({ ok: true, floatingTimer: true });
    } catch (error) {
      activeController = null;
      stopStatePump();
      return Promise.resolve({ ok: false, reason: error && error.message || 'Floating Timer could not be opened.' });
    }
  };

  // ── PiP button → in-app overlay (direct, no external pipapk) ──────────────
  // On Android, Browser PiP (documentPictureInPicture / requestPictureInPicture
  // / Document PiP) cannot host interactive app UI. Intercept those calls and
  // show the native FloatingTimerService overlay instead, wired to the same Focus store.
  // This covers the Focus toolbar's "Picture-in-Picture" button (beside wallpaper/fullscreen).
  // FIX: auto-discover controller on every trigger so PIP works even if Focus never called __isoOpenFloatingTimer.
  try {
    function ensureController() { if (!activeController) discoverController(); return activeController; }
    if (typeof HTMLVideoElement !== 'undefined' && HTMLVideoElement.prototype.requestPictureInPicture) {
      var _origPiP = HTMLVideoElement.prototype.requestPictureInPicture;
      HTMLVideoElement.prototype.requestPictureInPicture = function () {
        ensureController();
        if (activeController && isActiveTimerState(getControllerState())) {
          try { window.__isoOpenFloatingTimer(activeController); return Promise.resolve(this); } catch (e) {}
        }
        return _origPiP.apply(this, arguments);
      };
    }
    if (typeof window !== 'undefined' && window.documentPictureInPicture && typeof window.documentPictureInPicture.requestWindow === 'function') {
      var _origDocPiP = window.documentPictureInPicture.requestWindow.bind(window.documentPictureInPicture);
      window.documentPictureInPicture.requestWindow = function (opts) {
        ensureController();
        if (activeController && isActiveTimerState(getControllerState())) {
          try { window.__isoOpenFloatingTimer(activeController); } catch (e) {}
          return Promise.resolve({
            document: { body: { appendChild:function(){}, style:{}, addEventListener:function(){} }, createElement:function(){return {style:{}, addEventListener:function(){}}}, addEventListener:function(){}, removeEventListener:function(){} },
            close: function(){},
            addEventListener: function(){},
            removeEventListener: function(){}
          });
        }
        return _origDocPiP(opts);
      };
    } else if (typeof window !== 'undefined' && !window.documentPictureInPicture) {
      window.documentPictureInPicture = {
        requestWindow: function(opts){
          var c=ensureController();
          try{ if(c) window.__isoOpenFloatingTimer(c); }catch(e){}
          try{
            var b=nativeBridge();
            if(b&&b.startFloatingTimer){
              var st=getControllerState()||{timerState:"idle",mode:"pomodoro",displayedSeconds:1500};
              try{ b.startFloatingTimer(JSON.stringify(st)); }catch(e){}
            }
          }catch(e){}
          return Promise.resolve({ document:{body:{appendChild:function(){},style:{}},createElement:function(){return{style:{}}},addEventListener:function(){}}, close:function(){}, addEventListener:function(){} });
        }
      };
    }
    if (typeof document !== 'undefined' && 'pictureInPictureEnabled' in document) {
      try { Object.defineProperty(document, 'pictureInPictureEnabled', { get: function(){ return true; }, configurable:true }); } catch(e){}
    }
    function handlePipButtonClick(ev) {
      ensureController();
      if (!activeController || !isActiveTimerState(getControllerState())) return false;
      try { ev.preventDefault(); ev.stopPropagation(); window.__isoOpenFloatingTimer(activeController); return true; } catch(e){ return false; }
    }
    document.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('button, [role="button"], a') : null;
      if (!t) return;
      var txt = ((t.textContent || '') + ' ' + (t.getAttribute('aria-label') || '') + ' ' + (t.getAttribute('title') || '')).toLowerCase();
      var isPip = txt.indexOf('pip') !== -1 || txt.indexOf('picture') !== -1 || txt.indexOf('overlay') !== -1 || txt.indexOf('floating') !== -1;
      if (!isPip) {
        var icon = t.querySelector('svg, i');
        if (icon) {
          var ic = (icon.getAttribute('aria-label')||icon.getAttribute('title')||'').toLowerCase();
          if (ic.indexOf('pip')!==-1 || ic.indexOf('picture')!==-1) isPip=true;
        }
      }
      if (!isPip) return;
      handlePipButtonClick(ev);
    }, true);
    setInterval(function(){ try{ if(!activeController) discoverController(); }catch(e){} }, 1500);
    try {
      var __origCreate = null;
      Object.defineProperty(window, '__isoPipHookInstalled', { value: true, writable:false });
    } catch(e){}
  } catch (e) {}

  repairStoredFocusIconsOnce();
  window.addEventListener('beforeunload', function () {
    try { window.__ISO_FLOATING_TIMER__.close(); } catch (error) {}
  });

  console.log('[IsotopeAI] Android Floating Timer bridge installed — in-app PiP wired directly');
})();
