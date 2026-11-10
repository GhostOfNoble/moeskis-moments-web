// Service worker: keeps the app itself available offline, and plays videos from Google Drive by adding the
// signed-in person's access to each request (a <video> can't do that by itself), including seeking.
const SHELL = "moeski-shell-v4";
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
    e.respondWith(media(m[1], e.request, url));
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

/**
 * Streams a file from Drive. Safari only plays video when each "bytes X to Y" request gets a 206 answer saying
 * exactly which bytes these are out of how many; Drive doesn't let a web page see that header, so it's rebuilt here
 * from the file size the app already knows.
 */
async function media(id, request, url) {
  const size = Number(url.searchParams.get("size")) || 0;
  const type = url.searchParams.get("type") || "";
  const src = "https://www.googleapis.com/drive/v3/files/" + id + "?alt=media";
  const get = async (headers) => {
    let t = token || (await askForToken());
    let r = await fetch(src, { headers: { ...headers, Authorization: "Bearer " + t } });
    if (r.status === 401) { const fresh = await askForToken(); if (fresh && fresh !== t) r = await fetch(src, { headers: { ...headers, Authorization: "Bearer " + fresh } }); }
    return r;
  };
  const range = request.headers.get("Range");
  const want = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!want || !size) {
    const r = await get(range ? { Range: range } : {});
    if (!size) return r;
    return new Response(r.body, { status: r.ok ? 200 : r.status, headers: { "Content-Type": type || r.headers.get("Content-Type") || "", "Content-Length": String(size), "Accept-Ranges": "bytes" } });
  }
  let start, end;
  if (want[1] === "") { start = Math.max(0, size - Number(want[2])); end = size - 1; }
  else { start = Number(want[1]); end = want[2] === "" ? size - 1 : Math.min(Number(want[2]), size - 1); }
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + size } });
  const r = await get({ Range: `bytes=${start}-${end}` });
  if (!r.ok) return r;
  // If Drive ignored the range and sent everything, say so honestly.
  if (r.status === 200) return new Response(r.body, { status: 200, headers: { "Content-Type": type, "Content-Length": String(size), "Accept-Ranges": "bytes" } });
  return new Response(r.body, {
    status: 206,
    headers: { "Content-Type": type || r.headers.get("Content-Type") || "video/mp4", "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes" },
  });
}
