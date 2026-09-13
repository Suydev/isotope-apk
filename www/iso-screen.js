/**
 * iso-screen.js — resolution-aware layout policy ("tablet = PC").
 *
 * Compiled bundles pick mobile vs desktop layouts via window.innerWidth and
 * window.matchMedia (e.g. Sidebar: innerWidth<1024, Study: innerWidth>=1280).
 * On an 11" tablet (~800 CSS px wide) those checks wrongly select the phone
 * layout. We cannot rebuild the bundles, so this file reports a PC-class
 * viewport width to JS whenever the PHYSICAL screen is tablet-sized.
 *
 * Rules:
 *   - Only active inside the Android app (html.iso-android).
 *   - Threshold: real viewport >= 640 CSS px (sm breakpoint) => report at
 *     least 1280 so every desktop gate in the bundles opens.
 *   - CSS media queries / vw units are NOT affected (real values preserved),
 *     so injected dialog sizing keeps working per real screen.
 */
(function () {
  'use strict';
  try {
    var docEl = document.documentElement;
    var isAndroidApp = docEl.classList.contains('iso-android');
    // Capture before the innerWidth override below, otherwise realWidth() would
    // read the overridden getter and recurse forever on WebViews without
    // visualViewport ("Maximum call stack size exceeded").
    var nativeInnerWidth = window.innerWidth;
    function realWidth() {
      return window.visualViewport ? Math.round(window.visualViewport.width) : nativeInnerWidth;
    }
    var TABLET_MIN = 640;   // physical CSS px that qualifies as large-screen
    var REPORT_MIN = 1280;  // width reported to JS when tablet detected

    function effectiveWidth() {
      var w = realWidth();
      return (isAndroidApp && w >= TABLET_MIN) ? Math.max(w, REPORT_MIN) : w;
    }

    if (typeof window.__isoScreenEffective !== 'number') {
      Object.defineProperty(window, '__isoScreenEffective', {
        get: function () { return effectiveWidth(); },
        configurable: true
      });
    }

    // Override innerWidth getter for THIS window object only.
    try {
      Object.defineProperty(window, 'innerWidth', {
        get: function () { return effectiveWidth(); },
        configurable: true
      });
    } catch (e) { /* older WebView: leave as-is */ }

    // Wrap matchMedia so bundle breakpoint queries agree with the override
    // while everything else (prefers-color-scheme etc.) passes through.
    if (!window.__isoOrigMatchMedia && window.matchMedia) {
      var origMM = window.matchMedia.bind(window);
      var BP_RE = /^\((min|max)-width:\s*([\d.]+)(px|rem)\)$/;
      window.__isoOrigMatchMedia = origMM;
      window.matchMedia = function (q) {
        var mql = origMM(q);
        try {
          if (!isAndroidApp) return mql;
          var m = BP_RE.exec(String(q).trim());
          if (!m) return mql;
          var val = parseFloat(m[2]) * (m[3] === 'rem' ? 16 : 1);
          var realW = realWidth();
          if (realW < TABLET_MIN) return mql; // phones keep native behaviour
          var fakeMatches = m[1] === 'max' ? REPORT_MIN <= val : REPORT_MIN >= val;
          // Shadow `matches` on the REAL MediaQueryList (own property overrides
          // the prototype getter). Do NOT return Object.create(mql): that is a
          // chameleon object with no MediaQueryList/EventTarget internal slot,
          // so any addEventListener/removeEventListener call on it throws
          // "Illegal invocation" (e.g. Tasks' `(max-width: 639px)` listener).
          Object.defineProperty(mql, 'matches', {
            get: function () { return fakeMatches; },
            configurable: true
          });
          return mql;
        } catch (e2) { return mql; }
      };
    }
  } catch (err) {
    /* never block boot */
  }
})();
