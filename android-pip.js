/**
 * IsotopeAI Android Picture-in-Picture bridge.
 *
 * Android WebView does not implement the Document Picture-in-Picture API used by
 * the compiled Focus page. This polyfill preserves that renderer by providing a
 * small window/document facade backed by a full-screen overlay in the current
 * WebView, then asks MainActivity to enter Android system PiP.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.__ISO_IS_ANDROID__) return;

  var HOST_ID = '__iso_android_pip_host__';
  var activeWindow = null;
  var pagehideListeners = [];
  var previousBodyOverflow = '';
  var enterTimer = null;

  function nativeBridge() {
    return window.IsotopeNativePiP || null;
  }

  function removeHost() {
    var host = document.getElementById(HOST_ID);
    if (host && host.parentNode) host.parentNode.removeChild(host);
    document.documentElement.classList.remove('iso-native-pip-active');
    document.body.classList.remove('iso-native-pip-active');
    document.body.style.overflow = previousBodyOverflow;
  }

  function dispatchPagehide() {
    var listeners = pagehideListeners.slice();
    pagehideListeners.length = 0;
    listeners.forEach(function (listener) {
      try { listener.call(activeWindow || window, { type: 'pagehide' }); } catch (e) {
        console.warn('[IsotopeAI PiP] pagehide listener failed:', e && e.message);
      }
    });
  }

  function cleanup() {
    if (enterTimer !== null) {
      clearTimeout(enterTimer);
      enterTimer = null;
    }
    dispatchPagehide();
    removeHost();
    activeWindow = null;
  }

  function createHost() {
    removeHost();
    previousBodyOverflow = document.body.style.overflow || '';

    var host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-label', 'IsotopeAI Picture-in-Picture timer');
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '2147483647';
    host.style.display = 'flex';
    host.style.alignItems = 'stretch';
    host.style.justifyContent = 'stretch';
    host.style.width = '100vw';
    host.style.height = '100vh';
    host.style.overflow = 'hidden';
    host.style.background = '#000';

    document.documentElement.classList.add('iso-native-pip-active');
    document.body.classList.add('iso-native-pip-active');
    document.body.style.overflow = 'hidden';
    document.body.appendChild(host);
    return host;
  }

  function createDocumentFacade(host) {
    return {
      body: host,
      createElement: function (tagName) {
        return document.createElement(tagName);
      },
      getElementById: function (id) {
        if (host.id === id) return host;
        return host.querySelector('#' + String(id).replace(/[^a-zA-Z0-9_-]/g, ''));
      }
    };
  }

  function createWindowFacade(host) {
    var facade = {
      document: createDocumentFacade(host),
      prompt: function (message, defaultValue) {
        return window.prompt(message, defaultValue);
      },
      close: function () {
        var bridge = nativeBridge();
        if (bridge && typeof bridge.expand === 'function') {
          try { bridge.expand(); } catch (e) {}
        }
        cleanup();
      },
      addEventListener: function (type, listener) {
        if (type === 'pagehide' && typeof listener === 'function') {
          pagehideListeners.push(listener);
        }
      },
      removeEventListener: function (type, listener) {
        if (type !== 'pagehide') return;
        pagehideListeners = pagehideListeners.filter(function (item) { return item !== listener; });
      }
    };
    return facade;
  }

  function enterNative(width, height) {
    var bridge = nativeBridge();
    if (!bridge || typeof bridge.enter !== 'function') {
      cleanup();
      throw new Error('Native Android Picture-in-Picture bridge is unavailable.');
    }
    bridge.enter(Math.max(1, Number(width) || 340), Math.max(1, Number(height) || 390));
  }

  function requestWindow(options) {
    if (activeWindow) return Promise.resolve(activeWindow);

    var host = createHost();
    activeWindow = createWindowFacade(host);
    var width = options && options.width;
    var height = options && options.height;

    // Resolve first so the existing Focus renderer can populate the facade.
    // Enter native PiP on the next task, after its timer DOM is fully mounted.
    enterTimer = setTimeout(function () {
      enterTimer = null;
      if (!activeWindow) return;
      try { enterNative(width, height); }
      catch (error) {
        console.error('[IsotopeAI PiP] Failed to enter native PiP:', error);
        cleanup();
        try { alert(error.message || 'Picture-in-Picture could not be opened.'); } catch (e) {}
      }
    }, 80);

    return Promise.resolve(activeWindow);
  }

  var polyfill = { requestWindow: requestWindow };
  try {
    Object.defineProperty(window, 'documentPictureInPicture', {
      configurable: true,
      enumerable: false,
      value: polyfill
    });
  } catch (e) {
    window.documentPictureInPicture = polyfill;
  }

  window.__ISO_ANDROID_PIP__ = {
    requestWindow: requestWindow,
    isActive: function () { return !!activeWindow; },
    action: function (action) {
      var id = action === 'correct' ? 'pip-correct'
        : action === 'incorrect' ? 'pip-incorrect'
        : action === 'skipped' ? 'pip-skipped'
        : action === 'undo' ? 'pip-undo'
        : null;
      if (!id) return false;
      var button = document.getElementById(id);
      if (!button || typeof button.click !== 'function') return false;
      button.click();
      return true;
    },
    _onExit: cleanup
  };

  window.addEventListener('beforeunload', cleanup);
  console.log('[IsotopeAI] Android native Picture-in-Picture polyfill installed');
})();
