// Service worker: keeps the app itself available offline, and plays videos from Google Drive by adding the
// signed-in person's access to each request (a <video> can't do that by itself), including seeking.
const SHELL = "moeski-shell-v1";
const FILES = ["./", "index.html", "style.css", "app.js", "config.js", "manifest.webmanifest",
  "vendor/spark-md5.min.js", "vendor/exifr.lite.umd.js", "icons/icon-192.png", "icons/apple-touch-icon.png"];

let token = null;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("moeski-shell-") && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "token") token = e.data.token;
});

/** Ask an open page for the current access token (the worker may have been restarted and forgotten it). */
async function askForToken() {
  for (const c of await self.clients.matchAll({ type: "window" })) {
    const t = await new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = (m) => resolve(m.data && m.data.token);
      c.postMessage({ type: "need-token" }, [ch.port2]);
      setTimeout(() => resolve(null), 1500);
    });
    if (t) return (token = t);
  }
  return null;
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // /media/<fileId>: the file's bytes from Drive, with seeking (Range) passed through.
  const m = url.origin === self.location.origin && url.pathname.match(/\/media\/([A-Za-z0-9_-]+)$/);
  if (m) {
    e.respondWith((async () => {
      const t = token || (await askForToken());
      const headers = { Authorization: "Bearer " + t };
      const range = e.request.headers.get("Range");
      if (range) headers.Range = range;
      const r = await fetch("https://www.googleapis.com/drive/v3/files/" + m[1] + "?alt=media", { headers });
      if (r.status === 401) {
        const fresh = await askForToken();
        if (fresh && fresh !== t) return fetch("https://www.googleapis.com/drive/v3/files/" + m[1] + "?alt=media", { headers: { ...headers, Authorization: "Bearer " + fresh } });
      }
      return r;
    })());
    return;
  }
  // The app's own files: network first (so updates arrive), the saved copy when offline.
  if (url.origin === self.location.origin && e.request.method === "GET") {
    e.respondWith((async () => {
      try {
        const r = await fetch(e.request);
        if (r.ok) (await caches.open(SHELL)).put(e.request, r.clone());
        return r;
      } catch {
        return (await caches.match(e.request, { ignoreSearch: true })) || (await caches.match("index.html"));
      }
    })());
  }
});
