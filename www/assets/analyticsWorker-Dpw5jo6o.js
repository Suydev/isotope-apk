// analyticsWorker.js — Android build stub.
// The web app offloads analytics computation to a Web Worker. On Android the
// native bridge handles analytics, so the worker acknowledges with a default
// payload to keep the parent module graph stable.
self.onmessage = function (event) {
  const msg = event && event.data ? event.data : {};
  // Acknowledge with the same id; no analytics payload on Android.
  try { self.postMessage({ id: msg.id != null ? msg.id : null, data: null }); } catch (e) {}
};
export {};
