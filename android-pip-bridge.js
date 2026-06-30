/**
 * IsotopeAI compact timer Picture-in-Picture bridge for Android WebView.
 *
 * The Focus bundle already contains the complete Document Picture-in-Picture
 * renderer. Android WebView does not expose that browser API, so this file
 * provides a small compatible window/document facade backed by a fullscreen
 * DOM host. Once the renderer has populated that host, the existing Android
 * activity enters system PiP and displays only the compact timer card.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.__ISO_IS_ANDROID__) return;
  if (window.documentPictureInPicture && typeof window.documentPictureInPicture.requestWindow === 'function') return;

  var HOST_ID = '__isotope_android_timer_pip__';
  var activeWindow = null;
  var pagehideListeners = [];
  var previousBodyOverflow = '';
  var enterTimer = null;
  var confirmationTimer = null;
  var nativePipActive = false;

  function nativeBridge() {
    try { return window.IsotopeAndroid || null; }
    catch (e) { return null; }
  }

  function isSupported() {
    var bridge = nativeBridge();
    if (!bridge || typeof bridge.isPipSupported !== 'function') return false;
    try { return !!bridge.isPipSupported(); }
    catch (e) { return false; }
  }

  function clearScheduledTimers() {
    if (enterTimer !== null) {
      clearTimeout(enterTimer);
      enterTimer = null;
    }
    if (confirmationTimer !== null) {
      clearTimeout(confirmationTimer);
      confirmationTimer = null;
    }
  }

  function removeHost() {
    var host = document.getElementById(HOST_ID);
    if (host && host.parentNode) host.parentNode.removeChild(host);
    if (document.documentElement) document.documentElement.classList.remove('isotope-native-pip-active');
    if (document.body) {
      document.body.classList.remove('isotope-native-pip-active');
      document.body.style.overflow = previousBodyOverflow;
    }
  }

  function firePagehide() {
    var listeners = pagehideListeners.slice();
    pagehideListeners.length = 0;
    listeners.forEach(function (listener) {
      try { listener.call(activeWindow || window, { type: 'pagehide' }); }
      catch (error) { console.warn('[IsotopeAI PiP] pagehide listener failed:', error); }
    });
  }

  function cleanup() {
    clearScheduledTimers();
    firePagehide();
    removeHost();
    activeWindow = null;
    nativePipActive = false;
  }

  function expandAndCleanup() {
    var bridge = nativeBridge();
    if (nativePipActive && bridge && typeof bridge.expandFocusPip === 'function') {
      try { bridge.expandFocusPip(); } catch (e) {}
    }
    cleanup();
  }

  function createHost() {
    removeHost();
    if (!document.body) throw new Error('Android PiP cannot open before the document body is ready.');

    previousBodyOverflow = document.body.style.overflow || '';
    var host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-label', 'IsotopeAI focus timer Picture-in-Picture');
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '2147483647';
    host.style.width = '100vw';
    host.style.height = '100vh';
    host.style.display = 'flex';
    host.style.alignItems = 'stretch';
    host.style.justifyContent = 'stretch';
    host.style.overflow = 'hidden';
    host.style.background = '#000';
    host.style.contain = 'strict';

    document.documentElement.classList.add('isotope-native-pip-active');
    document.body.classList.add('isotope-native-pip-active');
    document.body.style.overflow = 'hidden';
    document.body.appendChild(host);
    return host;
  }

  function findInsideHost(host, id) {
    var element = document.getElementById(String(id));
    return element && host.contains(element) ? element : null;
  }

  function createDocumentFacade(host) {
    return {
      body: host,
      documentElement: host,
      createElement: function (tagName) { return document.createElement(tagName); },
      createTextNode: function (text) { return document.createTextNode(text); },
      getElementById: function (id) { return findInsideHost(host, id); },
      querySelector: function (selector) { return host.querySelector(selector); },
      querySelectorAll: function (selector) { return host.querySelectorAll(selector); }
    };
  }

  function createWindowFacade(host) {
    var facade = {
      document: createDocumentFacade(host),
      innerWidth: 340,
      innerHeight: 390,
      closed: false,
      prompt: function (message, defaultValue) { return window.prompt(message, defaultValue); },
      focus: function () {},
      close: function () {
        if (facade.closed) return;
        facade.closed = true;
        expandAndCleanup();
      },
      addEventListener: function (type, listener) {
        if (type === 'pagehide' && typeof listener === 'function') pagehideListeners.push(listener);
      },
      removeEventListener: function (type, listener) {
        if (type !== 'pagehide') return;
        pagehideListeners = pagehideListeners.filter(function (item) { return item !== listener; });
      }
    };
    return facade;
  }

  function enterNativePip(width, height) {
    var bridge = nativeBridge();
    if (!bridge) throw new Error('Android PiP bridge is unavailable.');

    if (typeof bridge.enterFocusPipWithSize === 'function') {
      bridge.enterFocusPipWithSize(Number(width) || 340, Number(height) || 390);
      return;
    }
    if (typeof bridge.enterFocusPip === 'function') {
      bridge.enterFocusPip();
      return;
    }
    throw new Error('Android PiP entry method is unavailable.');
  }

  function requestWindow(options) {
    if (activeWindow) return Promise.resolve(activeWindow);
    if (!isSupported()) return Promise.reject(new Error('Picture-in-Picture is not available on this Android device.'));

    var host;
    try { host = createHost(); }
    catch (error) { return Promise.reject(error); }

    activeWindow = createWindowFacade(host);
    var width = Math.max(1, Number(options && options.width) || 340);
    var height = Math.max(1, Number(options && options.height) || 390);
    activeWindow.innerWidth = width;
    activeWindow.innerHeight = height;

    // The Focus renderer continues immediately after this Promise resolves.
    // Enter system PiP on a later task so its compact timer DOM is already mounted.
    enterTimer = setTimeout(function () {
      enterTimer = null;
      if (!activeWindow) return;
      try {
        enterNativePip(width, height);
        confirmationTimer = setTimeout(function () {
          confirmationTimer = null;
          if (!nativePipActive && activeWindow) {
            cleanup();
            try { window.alert('Picture-in-Picture did not open on this device.'); } catch (e) {}
          }
        }, 2500);
      } catch (error) {
        console.error('[IsotopeAI PiP] Native entry failed:', error);
        cleanup();
        try { window.alert(error.message || 'Picture-in-Picture could not be opened.'); } catch (e) {}
      }
    }, 80);

    return Promise.resolve(activeWindow);
  }

  var documentPipFacade = { requestWindow: requestWindow };
  try {
    Object.defineProperty(window, 'documentPictureInPicture', {
      configurable: true,
      enumerable: false,
      value: documentPipFacade
    });
  } catch (error) {
    window.documentPictureInPicture = documentPipFacade;
  }

  window.__ISO_ANDROID_TIMER_PIP__ = {
    requestWindow: requestWindow,
    isActive: function () { return !!activeWindow; },
    action: function (action) {
      var id = action === 'correct' ? 'pip-correct'
        : action === 'incorrect' ? 'pip-incorrect'
        : action === 'skipped' ? 'pip-skipped'
        : action === 'undo' ? 'pip-undo'
        : null;
      if (!id) return false;
      var host = document.getElementById(HOST_ID);
      var button = host ? findInsideHost(host, id) : null;
      if (!button || typeof button.click !== 'function') return false;
      button.click();
      return true;
    },
    close: expandAndCleanup,
    cleanup: cleanup
  };

  // Older generated Focus bundles call this first. Returning ok:false deliberately
  // lets their existing fallback continue into documentPictureInPicture.requestWindow.
  window.__isoEnterFocusPip = function () {
    return Promise.resolve({ ok: false, native: true, compactRenderer: true });
  };

  window.addEventListener('isotope:pip-mode', function (event) {
    var active = !!(event && event.detail && event.detail.active);
    nativePipActive = active;
    if (active && confirmationTimer !== null) {
      clearTimeout(confirmationTimer);
      confirmationTimer = null;
    }
    if (!active && activeWindow) cleanup();
  });
  window.addEventListener('beforeunload', cleanup);

  console.log('[IsotopeAI] Compact Android timer PiP bridge installed');
})();
