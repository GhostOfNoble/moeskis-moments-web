// Moeski's Moments, web version (for iPhone and anything with a browser).
// Reads and writes the same Google Drive album as the Android app, following the same rules:
// the date a photo was taken, no duplicates, no near-identical burst shots, and the same notes on each file.

const CFG = window.MOESKI_CONFIG || {};
const SCOPE = "https://www.googleapis.com/auth/drive.file";
// Wider access, asked for only when bringing in photos added to the folder some other way (e.g. the Drive app).
const WIDE = "https://www.googleapis.com/auth/drive";
const API = "https://www.googleapis.com/drive/v3";
const REDIRECT = location.origin + location.pathname.replace(/index\.html$/, "");
const GRID = 12, MIN_SIMILARITY = 0.88, WINDOW_MS = 3 * 60 * 1000;
const VERSION = "1.0";

// ---------- small helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d = null) { try { const v = localStorage.getItem("moeski." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("moeski." + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem("moeski." + k); } catch {} },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
const ymKey = (t) => { const d = new Date(t); return d.getFullYear() * 100 + d.getMonth(); };
const fmtDur = (ms) => { const s = Math.round((ms || 0) / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

const ICON = {
  album: "M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4 2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z",
  memories: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 13.5v-9l6 4.5-6 4.5z",
  add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  settings: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  filter: "M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z",
  down: "M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z",
  back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
  more: "M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
  heart: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  heartO: "M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z",
  up: "M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z",
  downThumb: "M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z",
  share: "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z",
  trash: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  video: "M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z",
  photo: "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z",
  check: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  refresh: "M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z",
};
const svg = (name, cls = "i") => `<svg class="${cls}" viewBox="0 0 24 24"><path d="${ICON[name]}"/></svg>`;

function toast(text, ms = 3200) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const t = el(`<div class="toast">${esc(text)}</div>`);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

// ---------- signing in (Google, as the album's owner) ----------
const auth = {
  get token() { const a = store.get("auth"); return a && a.exp > Date.now() + 60_000 ? a.token : null; },
  get minutesLeft() { const a = store.get("auth"); return a ? Math.floor((a.exp - Date.now()) / 60000) : 0; },
  /** Goes to Google and comes back here. [silent] tries without asking again (works while still signed in to Google). */
  get hasWide() { const a = store.get("auth"); return !!a?.scope?.split(" ").includes(WIDE); },
  signIn(silent = false, extra = null) {
    if (!CFG.clientId) { toast("The web sign-in isn't set up yet (no client ID)."); return; }
    sessionStorage.setItem("moeski.return", JSON.stringify({ tab: ui.tab, scroll: scrollY }));
    const p = new URLSearchParams({
      client_id: CFG.clientId, redirect_uri: REDIRECT, response_type: "token", scope: extra ? SCOPE + " " + extra : SCOPE,
      include_granted_scopes: "true", state: silent ? "silent" : "ask",
    });
    const hint = store.get("email");
    if (hint) p.set("login_hint", hint);
    if (silent) p.set("prompt", "none");
    location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + p;
  },
  /** Picks up the token Google sends back in the address. */
  fromRedirect() {
    if (!location.hash) return null;
    const h = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, "", location.pathname);
    if (h.get("access_token")) {
      store.set("auth", { token: h.get("access_token"), exp: Date.now() + (Number(h.get("expires_in")) || 3600) * 1000, scope: h.get("scope") || "" });
      return "ok";
    }
    if (h.get("error")) return h.get("error");
    return null;
  },
  signOut() { store.del("auth"); store.del("items"); store.del("folder"); location.reload(); },
};

// The service worker plays videos with the person's access; give it the token whenever it asks.
function shareTokenWithWorker() {
  navigator.serviceWorker?.controller?.postMessage({ type: "token", token: auth.token });
}
navigator.serviceWorker?.addEventListener("message", (e) => {
  if (e.data?.type === "need-token" && e.ports[0]) e.ports[0].postMessage({ token: auth.token });
});

// ---------- Google Drive ----------
async function api(path, opts = {}, retry = true) {
  const token = auth.token;
  if (!token) { auth.signIn(true); throw new Error("signing in"); }
  const r = await fetch(path.startsWith("http") ? path : API + path, {
    ...opts, headers: { Authorization: "Bearer " + token, ...(opts.headers || {}) },
  });
  if (r.status === 401 && retry) { store.del("auth"); auth.signIn(true); throw new Error("signing in"); }
  if (!r.ok) throw new Error((await r.text().catch(() => "")).slice(0, 300) || "Drive error " + r.status);
  return r.status === 204 ? null : r.json();
}

async function findFolder() {
  const cached = store.get("folder");
  if (cached) return cached;
  const q = `mimeType='application/vnd.google-apps.folder' and name='${CFG.folderName.replace(/'/g, "\\'")}' and trashed=false`;
  const r = await api("/files?" + new URLSearchParams({ q, fields: "files(id)", spaces: "drive" }));
  const id = r.files?.[0]?.id || null;
  if (id) store.set("folder", id);
  return id;
}

const FIELDS = "id,name,mimeType,thumbnailLink,appProperties,createdTime,size,md5Checksum,modifiedTime,imageMediaMetadata(width,height,rotation,time),videoMediaMetadata(durationMillis,width,height)";

function toItem(f) {
  const p = f.appProperties || {};
  const created = Date.parse(f.createdTime) || 0;
  return {
    id: f.id, name: f.name, mime: f.mimeType, thumb: f.thumbnailLink || null,
    takenAt: Number(p.takenAt) || created, size: Number(f.size) || 0,
    md5: p.md5 || f.md5Checksum || null, fp: fromProps(p.fp1, p.fp2),
    video: (f.mimeType || "").startsWith("video/"), montage: p.kind === "montage", autoFor: p.autoFor || null,
    fav: p.fav === "1", like: p.like === "1" ? true : p.like === "0" ? false : null,
    duration: Number(f.videoMediaMetadata?.durationMillis) || 0,
    rot: ((Number(p.rot) || 0) % 360 + 360) % 360,
  };
}

async function listAll(folder) {
  const out = [], outside = [];
  let page = null;
  do {
    const q = new URLSearchParams({ q: `'${folder}' in parents and trashed=false`, pageSize: "1000", fields: "nextPageToken,files(" + FIELDS + ")", spaces: "drive" });
    if (page) q.set("pageToken", page);
    const r = await api("/files?" + q);
    for (const f of r.files || []) {
      if (!/^(image|video)\//.test(f.mimeType || "")) continue;
      // Files this app made always carry its notes; ones without were added some other way (only visible with wider access).
      if (!f.appProperties || !Object.keys(f.appProperties).length) outside.push(f);
      else out.push(toItem(f));
    }
    page = r.nextPageToken;
  } while (page);
  out.sort((a, b) => b.takenAt - a.takenAt);
  state.outside = outside;
  return out;
}

const setProps = (id, props) => api(`/files/${id}?fields=id`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appProperties: props }) });
const trash = (id) => api(`/files/${id}?fields=id`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });

// ---------- thumbnails ----------
// Drive's thumbnails need the person's access. Which way works is found once and remembered:
// "img" (shown directly), "auth" (fetched with access), or "media" (made here from the full photo).
const thumbs = {
  mode: store.get("thumbMode"),
  urls: new Map(),
  queue: [], running: 0,
  sized(item, px) { return item.thumb ? item.thumb.replace(/=s\d+$/, "=s" + px) : null; },
  async cache() { return caches.open("moeski-thumbs-v1"); },
  /** Puts the picture for [item] into [img] at about [px] pixels. */
  load(item, img, px = 400) {
    const key = item.id + "@" + px;
    if (this.urls.has(key)) { img.src = this.urls.get(key); return; }
    this.queue.push({ item, img, px, key });
    this.pump();
  },
  pump() {
    while (this.running < 4 && this.queue.length) {
      const job = this.queue.shift();
      if (!job.img.isConnected) continue;
      this.running++;
      this.fetchOne(job).catch(() => {}).finally(() => { this.running--; this.pump(); });
    }
  },
  async fetchOne({ item, img, px, key }) {
    const c = await this.cache();
    const hit = await c.match(key);
    if (hit) { const u = URL.createObjectURL(await hit.blob()); this.urls.set(key, u); img.src = u; return; }
    const tryModes = this.mode ? [this.mode] : ["auth", "img", "media"];
    for (const mode of tryModes) {
      const blob = await this.via(mode, item, px).catch(() => null);
      if (blob === "img") { if (!this.mode) { this.mode = "img"; store.set("thumbMode", "img"); } img.src = this.sized(item, px); return; }
      if (blob) {
        if (!this.mode) { this.mode = mode; store.set("thumbMode", mode); }
        await c.put(key, new Response(blob)).catch(() => {});
        const u = URL.createObjectURL(blob); this.urls.set(key, u); img.src = u; return;
      }
    }
  },
  async via(mode, item, px) {
    if (mode === "auth") {
      const u = this.sized(item, px); if (!u) return null;
      const r = await fetch(u, { headers: { Authorization: "Bearer " + auth.token } });
      return r.ok ? r.blob() : null;
    }
    if (mode === "img") {
      const u = this.sized(item, px); if (!u) return null;
      return new Promise((res) => { const t = new Image(); t.onload = () => res(t.naturalWidth > 0 ? "img" : null); t.onerror = () => res(null); t.src = u; });
    }
    if (mode === "media" && !item.video) {
      const r = await fetch("media/" + item.id);
      if (!r.ok) return null;
      const bmp = await createImageBitmap(await r.blob());
      const s = Math.min(1, px / Math.max(bmp.width, bmp.height));
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(bmp.width * s)); cv.height = Math.max(1, Math.round(bmp.height * s));
      cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
      return new Promise((res) => cv.toBlob(res, "image/jpeg", 0.85));
    }
    return null;
  },
};
const seen = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) {
    const img = e.target; seen.unobserve(img);
    const item = byId.get(img.dataset.id);
    if (item) thumbs.load(item, img, Number(img.dataset.px) || 400);
  }
}, { rootMargin: "600px 0px" });
function lazyImg(item, px, cls = "") {
  const img = el(`<img alt="" class="${cls}" data-id="${item.id}" data-px="${px}" decoding="async">`);
  img.onload = () => img.classList.add("ready");
  seen.observe(img);
  return img;
}

// ---------- fingerprints and dates (the same rules as the Android app) ----------
function b64(bytes) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function fromProps(a, b) {
  if (!a || !b) return null;
  try { const s = atob(a + b); if (s.length !== GRID * GRID) return null; return Uint8Array.from(s, (c) => c.charCodeAt(0)); } catch { return null; }
}
function toProps(fp) { const e = b64(fp); const mid = Math.floor(e.length / 2); return { fp1: e.slice(0, mid), fp2: e.slice(mid) }; }
function similarity(a, b) {
  const norm = (f) => { const v = Array.from(f, Number); const m = v.reduce((x, y) => x + y, 0) / v.length; let n = 0; for (let i = 0; i < v.length; i++) { v[i] -= m; n += v[i] * v[i]; } n = Math.max(Math.sqrt(n), 1e-9); return v.map((x) => x / n); };
  const va = norm(a), vb = norm(b); let d = 0; for (let i = 0; i < va.length; i++) d += va[i] * vb[i]; return d;
}
async function decodeImage(file) {
  try { return await createImageBitmap(file); } catch {}
  const url = URL.createObjectURL(file);
  try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
/** 12×12 greyscale averages of a 256-pixel copy: matches ImageHash.fingerprint on Android. */
async function fingerprint(file) {
  const src = await decodeImage(file);
  const W = src.width, H = src.height, scale = 256 / Math.max(W, H);
  const w = Math.max(1, Math.floor(W * scale)), h = Math.max(1, Math.floor(H * scale));
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high"; ctx.drawImage(src, 0, 0, w, h);
  src.close?.();
  const px = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(GRID * GRID);
  for (let cy = 0; cy < GRID; cy++) for (let cx = 0; cx < GRID; cx++) {
    const x0 = Math.floor(cx * w / GRID), x1 = Math.max(x0 + 1, Math.floor((cx + 1) * w / GRID));
    const y0 = Math.floor(cy * h / GRID), y1 = Math.max(y0 + 1, Math.floor((cy + 1) * h / GRID));
    let sum = 0, n = 0;
    for (let y = y0; y < Math.min(y1, h); y++) for (let x = x0; x < Math.min(x1, w); x++) {
      const i = (y * w + x) * 4; sum += Math.floor((px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000); n++;
    }
    out[cy * GRID + cx] = n ? Math.floor(sum / n) : 0;
  }
  return out;
}
async function md5(file, onProgress) {
  const spark = new SparkMD5.ArrayBuffer(), chunk = 4 << 20;
  for (let o = 0; o < file.size; o += chunk) { spark.append(await file.slice(o, o + chunk).arrayBuffer()); onProgress?.(Math.min(1, (o + chunk) / file.size)); }
  return spark.end();
}
const sane = (t) => t && t > Date.UTC(2000, 0, 1) && t < Date.now() + 86_400_000 ? t : null;
/** When it was taken: the camera's date inside the file, else a date in its name, else the file's own date. */
async function takenAt(file) {
  if (file.type.startsWith("image/") || /\.(heic|heif|jpe?g|png)$/i.test(file.name)) {
    try {
      const x = await exifr.parse(file, { pick: ["DateTimeOriginal", "CreateDate", "OffsetTimeOriginal", "OffsetTime"] });
      const d = x?.DateTimeOriginal || x?.CreateDate;
      if (d instanceof Date && !isNaN(d)) {
        const off = x.OffsetTimeOriginal || x.OffsetTime;
        // exifr reads the camera clock as this phone's local time; correct it if the photo says which time zone it was in.
        if (off && /^[+-]\d{2}:\d{2}$/.test(off)) {
          const mins = (off[0] === "-" ? -1 : 1) * (Number(off.slice(1, 3)) * 60 + Number(off.slice(4, 6)));
          const t = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) - mins * 60000;
          if (sane(t)) return t;
        }
        if (sane(d.getTime())) return d.getTime();
      }
    } catch {}
  }
  if (file.type.startsWith("video/") || /\.(mov|mp4|m4v)$/i.test(file.name)) {
    const t = await videoCreated(file).catch(() => null);
    if (sane(t)) return t;
  }
  const m = file.name.match(/(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?([0-2]\d|3[01])(?:[-_ T.]?([01]\d|2[0-3])[-_.]?([0-5]\d)[-_.]?([0-5]\d))?/);
  if (m) { const t = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0)).getTime(); if (sane(t)) return t; }
  return sane(file.lastModified) || Date.now();
}
/** A video's "created" time from inside the file (the mvhd box), seconds since 1904. */
async function videoCreated(file) {
  const look = async (start, end) => {
    const buf = new Uint8Array(await file.slice(start, end).arrayBuffer());
    for (let i = 0; i + 16 < buf.length; i++) if (buf[i] === 0x6d && buf[i + 1] === 0x76 && buf[i + 2] === 0x68 && buf[i + 3] === 0x64) {
      const dv = new DataView(buf.buffer, buf.byteOffset + i + 4);
      const secs = dv.getUint8(0) === 1 ? Number(dv.getBigUint64(4)) : dv.getUint32(4);
      if (secs > 0) return (secs - 2082844800) * 1000;
    }
    return null;
  };
  return (await look(0, 2 << 20)) || (await look(Math.max(0, file.size - (2 << 20)), file.size));
}

// ---------- uploading ----------
function resumableUpload(file, meta, onProgress) {
  return new Promise(async (resolve, reject) => {
    try {
      const start = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=" + encodeURIComponent(FIELDS), {
        method: "POST",
        headers: {
          Authorization: "Bearer " + auth.token, "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": meta.mimeType, "X-Upload-Content-Length": String(file.size),
        },
        body: JSON.stringify(meta),
      });
      if (!start.ok) throw new Error("Drive refused the upload (" + start.status + ")");
      const where = start.headers.get("Location");
      if (!where) throw new Error("Drive didn't give an upload address");
      const x = new XMLHttpRequest();
      x.open("PUT", where);
      x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      x.onload = () => (x.status >= 200 && x.status < 300 ? resolve(JSON.parse(x.responseText)) : reject(new Error("Upload failed (" + x.status + ")")));
      x.onerror = () => reject(new Error("The connection dropped"));
      x.send(file);
    } catch (e) { reject(e); }
  });
}
function guessMime(file) {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop().toLowerCase();
  return { mov: "video/quicktime", mp4: "video/mp4", m4v: "video/mp4", heic: "image/heic", heif: "image/heif", png: "image/png" }[ext] || "image/jpeg";
}

/** Adds files to the album one at a time, skipping anything already there (same file, or a near-identical shot). */
async function uploadFiles(files) {
  if (!files.length) return;
  if (auth.minutesLeft < 30) { toast("Signing in again first, then pick them again…"); await sleep(900); auth.signIn(true); return; }
  const folder = await findFolder();
  const byMd5 = new Map(), photos = [];
  for (const it of state.items) { if (it.md5) byMd5.set(it.md5, it.id); if (it.fp) photos.push(it); }
  const sheet = openSheet(`<div><h2>Adding ${files.length} to the album</h2><p class="what">Getting ready…</p>
    <div class="progress"><div></div></div><p class="detail small-print" style="margin:0"></p>
    <p class="small-print" style="margin:12px 0 0">Keep this open until it finishes.</p></div>`, { closable: false });
  const what = $(".what", sheet), bar = $(".progress > div", sheet), detail = $(".detail", sheet);
  let lock = null; try { lock = await navigator.wakeLock?.request("screen"); } catch {}
  let added = 0, already = 0, failed = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const step = (frac, text) => { bar.style.width = ((i + frac) / files.length * 100).toFixed(1) + "%"; if (text) what.textContent = text; };
    try {
      step(0, `Checking ${i + 1} of ${files.length}`);
      const sum = await md5(file, (p) => step(p * 0.2));
      if (byMd5.has(sum)) { already++; continue; }
      const mime = guessMime(file);
      const when = await takenAt(file);
      let fp = null;
      if (mime.startsWith("image/")) {
        fp = await fingerprint(file).catch(() => null);
        if (fp && photos.some((p) => Math.abs(p.takenAt - when) <= WINDOW_MS && similarity(fp, p.fp) >= MIN_SIMILARITY)) { already++; continue; }
      }
      step(0.2, `Uploading ${i + 1} of ${files.length}`);
      const props = { takenAt: String(when), app: "moeski", md5: sum, source: "web", ...(fp ? toProps(fp) : {}) };
      const f = await resumableUpload(file, { name: file.name, mimeType: mime, parents: [folder], appProperties: props }, (p) => step(0.2 + p * 0.8));
      const item = toItem(f);
      state.items.push(item); byId.set(item.id, item); byMd5.set(sum, item.id); if (fp) photos.push(item);
      added++;
    } catch (e) {
      failed++; console.warn("Couldn't add " + file.name, e);
    } finally {
    detail.textContent = [added && `${added} added`, already && `${already} already in the album`, failed && `${failed} failed`].filter(Boolean).join(" · ");
    }
  }
  lock?.release?.();
  state.items.sort((a, b) => b.takenAt - a.takenAt);
  store.set("items", state.items);
  bar.style.width = "100%";
  what.textContent = "Done";
  sheet.append(el(`<div class="row end" style="margin-top:14px"><button class="btn">OK</button></div>`));
  $(".btn", sheet).onclick = () => { closeSheet(); render(); };
  // Thumbnails for new videos can take Drive a minute to make.
  setTimeout(() => refresh(true), 60_000);
}

// ---------- bringing in photos added to the folder some other way ----------
/** Bytes [a..b] of a Drive file. */
async function rangeBytes(id, a, b) {
  const r = await fetch(`${API}/files/${id}?alt=media`, { headers: { Authorization: "Bearer " + auth.token, Range: `bytes=${a}-${b}` } });
  if (!r.ok) throw new Error("Drive said " + r.status);
  return r.arrayBuffer();
}
/** When a Drive file was taken, read from the file itself without downloading all of it. */
async function remoteTakenAt(f) {
  const size = Number(f.size) || 0;
  const t = (x) => Date.parse(x) || Infinity;
  let fallback = Math.min(t(f.modifiedTime), t(f.createdTime));
  const meta = f.imageMediaMetadata?.time && /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(f.imageMediaMetadata.time);
  if (meta) fallback = new Date(+meta[1], +meta[2] - 1, +meta[3], +meta[4], +meta[5], +meta[6]).getTime();
  if (!isFinite(fallback)) fallback = Date.now();
  if (f.mimeType.startsWith("image/") && size) {
    const head = await rangeBytes(f.id, 0, Math.min(size, 1 << 20) - 1);
    return takenAt(new File([head], f.name, { type: f.mimeType, lastModified: fallback }));
  }
  const remote = { name: f.name, type: f.mimeType, size, lastModified: fallback,
    slice: (a, b) => ({ arrayBuffer: () => rangeBytes(f.id, a, Math.min(b, size) - 1) }) };
  return takenAt(remote);
}
/** The same 12×12 fingerprint uploads get, made from Drive's own preview of the photo. */
async function remoteFingerprint(f) {
  let blob = null;
  if (f.thumbnailLink) {
    const r = await fetch(f.thumbnailLink.replace(/=s\d+$/, "=s512"), { headers: { Authorization: "Bearer " + auth.token } }).catch(() => null);
    if (r?.ok) blob = await r.blob();
  }
  if (!blob && Number(f.size) < 30e6) {
    const r = await fetch(`${API}/files/${f.id}?alt=media`, { headers: { Authorization: "Bearer " + auth.token } });
    if (r.ok) blob = await r.blob();
  }
  return blob ? fingerprint(blob).catch(() => null) : null;
}

/**
 * Photos and videos put in the album's Drive folder some other way (like the Google Drive app on an iPhone)
 * can't be seen by either app. This makes the app's own copy of each inside Drive (no downloading, full quality),
 * with the same notes an upload gets, skips anything already in the album, then moves the originals to the bin.
 */
async function bringIn() {
  if (!auth.hasWide) {
    sessionStorage.setItem("moeski.resume", "bringIn");
    const sheet = openSheet(`<div><h2>Allow access to the folder</h2>
      <p>To see photos added outside the app, Google will ask you to let Moeski's Moments see your Google Drive. It only looks in the “${esc(CFG.folderName)}” folder.</p>
      <p>Google may say the app isn't verified: tap <b>Advanced</b>, then <b>Go to Moeski's Moments</b>, and tick the Drive box if one is shown.</p>
      <div class="row end"><button class="btn secondary" id="no">Not now</button><button class="btn" id="yes">Continue</button></div></div>`);
    $("#no", sheet).onclick = () => { sessionStorage.removeItem("moeski.resume"); closeSheet(); };
    $("#yes", sheet).onclick = () => auth.signIn(false, WIDE);
    return;
  }
  if (auth.minutesLeft < 20) { sessionStorage.setItem("moeski.resume", "bringIn"); auth.signIn(true); return; }
  toast("Looking in the folder…", 2000);
  state.loading = false;
  await refresh(true);
  const todo = state.outside.slice();
  if (!todo.length) { toast("Nothing to bring in. Everything in the folder is already in the album."); return; }
  const folder = await findFolder();
  const byMd5 = new Set(), photos = [];
  for (const it of state.items) { if (it.md5) byMd5.add(it.md5); if (it.fp) photos.push(it); }
  const sheet = openSheet(`<div><h2>Bringing in ${todo.length}</h2><p class="what">Getting ready…</p>
    <div class="progress"><div></div></div><p class="detail small-print" style="margin:0"></p>
    <p class="small-print" style="margin:12px 0 0">Copies are made inside Google Drive at full quality. Keep this open until it finishes; if it's interrupted, tap the button again and it carries on.</p></div>`, { closable: false });
  const what = $(".what", sheet), bar = $(".progress > div", sheet), detail = $(".detail", sheet);
  let lock = null; try { lock = await navigator.wakeLock?.request("screen"); } catch {}
  let done = 0, added = 0, already = 0, failed = 0, next = 0;
  const show = () => {
    bar.style.width = (done / todo.length * 100).toFixed(1) + "%";
    what.textContent = `${done} of ${todo.length}`;
    detail.textContent = [added && `${added} added`, already && `${already} already in the album`, failed && `${failed} couldn't be added`].filter(Boolean).join(" · ");
  };
  const one = async (f) => {
    const md5sum = f.md5Checksum || null;
    if (md5sum && byMd5.has(md5sum)) { await trash(f.id); already++; return; }
    const when = await remoteTakenAt(f);
    const fp = f.mimeType.startsWith("image/") ? await remoteFingerprint(f) : null;
    if (fp && photos.some((p) => Math.abs(p.takenAt - when) <= WINDOW_MS && similarity(fp, p.fp) >= MIN_SIMILARITY)) { await trash(f.id); already++; return; }
    const props = { takenAt: String(when), app: "moeski", source: "import", ...(md5sum ? { md5: md5sum } : {}), ...(fp ? toProps(fp) : {}) };
    const copy = await api(`/files/${f.id}/copy?fields=${encodeURIComponent(FIELDS)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: f.name, parents: [folder], appProperties: props }),
    });
    await trash(f.id);
    const item = toItem(copy);
    state.items.push(item); byId.set(item.id, item);
    if (md5sum) byMd5.add(md5sum);
    if (item.fp) photos.push(item);
    added++;
  };
  const worker = async () => {
    while (next < todo.length) {
      const f = todo[next++];
      try { await one(f); } catch (e) { failed++; console.warn("Couldn't bring in " + f.name, e); }
      done++; show();
    }
  };
  show();
  await Promise.all([worker(), worker(), worker()]);
  lock?.release?.();
  sessionStorage.removeItem("moeski.resume");
  state.items.sort((a, b) => b.takenAt - a.takenAt);
  store.set("items", state.items);
  state.outside = [];
  what.textContent = failed ? "Finished, with some problems" : "Done";
  if (failed) sheet.append(el(`<p class="small-print" style="margin:8px 0 0">Tap the button again to retry the ones that didn't work.</p>`));
  sheet.append(el(`<div class="row end" style="margin-top:14px"><button class="btn">OK</button></div>`));
  $(".btn", sheet).onclick = () => { closeSheet(); render(); };
}

// ---------- state ----------
const state = { items: store.get("items", []), outside: [], folder: null, loading: false, error: null };
const byId = new Map(state.items.map((i) => [i.id, i]));
const ui = { tab: "album", kind: store.get("kind", "both"), show: store.get("show", "all"), cols: store.get("cols", 3), selecting: false, picked: new Set(), year: null };

function visible() {
  return state.items.filter((i) => !i.montage
    && (ui.kind === "both" || (ui.kind === "videos") === i.video)
    && (ui.show === "all" || (ui.show === "liked" && i.like === true) || (ui.show === "fav" && i.fav) || (ui.show === "disliked" && i.like === false) || (ui.show === "unsorted" && i.like == null)));
}
function ageText(t) {
  const b = store.get("birthday"); if (!b) return null;
  const born = new Date(b + "T00:00:00"), d = new Date(t);
  let m = (d.getFullYear() - born.getFullYear()) * 12 + d.getMonth() - born.getMonth();
  if (d.getDate() < born.getDate()) m--;
  if (m < 0) return null;
  if (m < 1) return `${CFG.childName}, newborn`;
  if (m < 12) return `${CFG.childName}, ${m} mo${m === 1 ? "" : "s"}`;
  const y = Math.floor(m / 12), r = m % 12;
  return `${CFG.childName}, ${y} year${y === 1 ? "" : "s"}${r ? " " + r + " mo" + (r === 1 ? "" : "s") : ""}`;
}

async function refresh(quiet = false) {
  if (state.loading) return;
  state.loading = true;
  try {
    state.folder = await findFolder();
    if (!state.folder) { state.error = "nofolder"; render(); return; }
    const items = await listAll(state.folder);
    state.items = items; byId.clear(); items.forEach((i) => byId.set(i.id, i));
    store.set("items", items); state.error = null;
    render();
  } catch (e) {
    if (e.message !== "signing in" && !quiet) toast("Couldn't load the album: " + e.message.slice(0, 120));
  } finally { state.loading = false; }
}

// ---------- screens ----------
const root = $("#app");

function render() {
  const keep = scrollY;
  root.innerHTML = "";
  if (!auth.token && !store.get("auth")) return renderSignIn();
  if (state.error === "nofolder") return renderNoFolder();
  if (ui.tab === "album") renderAlbum();
  else if (ui.tab === "memories") renderMemories();
  else renderSettings();
  renderNav();
  if (ui.tab === "album") requestAnimationFrame(() => scrollTo(0, keep));
}

function renderSignIn(message) {
  root.append(el(`<div class="signin">
    <img src="icons/icon-192.png" alt="">
    <h1>Moeski's Moments</h1>
    <p>${message ? esc(message) : "Sign in with the Google account that holds the album."}</p>
    <button class="btn" id="go">Sign in with Google</button>
    <p class="small-print">Google may say this app isn't verified, because it's a private family app. Tap <b>Advanced</b>, then <b>Go to Moeski's Moments</b>.</p>
  </div>`));
  $("#go").onclick = () => auth.signIn(false);
}

function renderNoFolder() {
  root.append(el(`<div class="signin"><h1>Album not found</h1>
    <p>This Google account can't see the “${esc(CFG.folderName)}” album yet. Make sure you signed in with the same account the Android app uses.</p>
    <button class="btn" id="again">Try again</button><button class="btn secondary" id="out">Sign out</button></div>`));
  $("#again").onclick = () => { store.del("folder"); state.error = null; refresh(); };
  $("#out").onclick = () => auth.signOut();
}

function renderNav() {
  const nav = el(`<div class="nav">
    <div class="tabs glass">
      <button data-tab="album" class="${ui.tab === "album" ? "on" : ""}">${svg("album")}Album</button>
      <button data-tab="memories" class="${ui.tab === "memories" ? "on" : ""}">${svg("memories")}Memories</button>
    </div>
    <button class="add glass" aria-label="Add photos and videos">${svg("add")}</button>
  </div>`);
  nav.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { ui.tab = b.dataset.tab; ui.selecting = false; scrollTo(0, 0); render(); }));
  $(".add", nav).onclick = pickFiles;
  if (ui.selecting) nav.innerHTML = "";
  root.append(nav);
  if (ui.selecting) renderSelectionTray();
}

function pickFiles() {
  const input = el(`<input type="file" accept="image/*,video/*" multiple style="display:none">`);
  input.onchange = () => { uploadFiles(Array.from(input.files || [])); input.remove(); };
  document.body.append(input);
  input.click();
}

function renderAlbum() {
  document.documentElement.style.setProperty("--cols", ui.cols);
  const items = visible();
  const groups = new Map();
  for (const it of items) { const k = ymKey(it.takenAt); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  const keys = [...groups.keys()];
  const years = [...new Set(keys.map((k) => Math.floor(k / 100)))];
  if (!ui.year || !years.includes(ui.year)) ui.year = years[0] || new Date().getFullYear();

  // Top: Select, year, filter, settings, and the month capsule.
  const top = el(`<div class="topbar">
    <div class="toprow">
      ${ui.selecting ? `<button class="pill glass" id="cancel">Cancel</button><div class="grow"><span class="pill glass">${ui.picked.size ? ui.picked.size + " selected" : "Select items"}</span></div><button class="pill glass" id="all">All</button>`
        : `<button class="pill glass" id="select">Select</button>
      <div class="grow"><button class="pill glass" id="year">${ui.year}${years.length > 1 ? svg("down") : ""}</button></div>
      <button class="round glass" id="filter" aria-label="Show">${svg(ui.kind === "videos" ? "video" : ui.kind === "photos" ? "photo" : ui.show === "fav" ? "heart" : ui.show === "liked" ? "up" : "filter")}</button>
      <button class="round glass" id="settings" aria-label="Settings">${svg("settings")}</button>`}
    </div>
    ${ui.selecting ? "" : `<div class="months glass" id="months">${keys.filter((k) => Math.floor(k / 100) === ui.year).map((k) => `<button data-k="${k}">${SHORT[k % 100]}</button>`).join("")}</div>`}
  </div>`);
  root.append(top);
  if (ui.selecting) {
    $("#cancel", top).onclick = () => { ui.selecting = false; ui.picked.clear(); render(); };
    $("#all", top).onclick = () => { items.forEach((i) => ui.picked.add(i.id)); render(); };
  } else {
    $("#select", top).onclick = () => { ui.selecting = true; ui.picked.clear(); render(); };
    $("#settings", top).onclick = () => { ui.tab = "settings"; scrollTo(0, 0); render(); };
    $("#filter", top).onclick = (e) => filterMenu(e.currentTarget);
    $("#year", top).onclick = (e) => years.length > 1 && openMenu(e.currentTarget, years.map((y) => ({ label: String(y), on: y === ui.year, run: () => { ui.year = y; const k = keys.find((x) => Math.floor(x / 100) === y); render(); document.getElementById("m" + k)?.scrollIntoView(); } })));
    top.querySelectorAll("#months button").forEach((b) => (b.onclick = () => document.getElementById("m" + b.dataset.k)?.scrollIntoView({ behavior: "smooth" })));
  }

  const main = el(`<main></main>`);
  if (state.outside.length && !ui.selecting) {
    const n = state.outside.length;
    const b = el(`<button class="banner"><div class="grow"><div class="t">${n} in the Drive folder ${n === 1 ? "isn't" : "aren't"} in the album yet</div><div class="s">Tap to bring ${n === 1 ? "it" : "them"} in</div></div>${svg("add")}</button>`);
    b.onclick = bringIn;
    main.append(b);
  }
  if (!items.length) main.append(el(`<div class="empty">${state.items.length ? "Nothing matches this filter." : state.loading ? "Loading the album…" : "No photos yet. Tap + to add some."}</div>`));
  for (const k of keys) {
    const list = groups.get(k);
    const cover = list.find((i) => i.fav && !i.video) || list.find((i) => i.like && !i.video) || list.find((i) => !i.video) || list[0];
    const sec = el(`<section class="month" id="m${k}" data-k="${k}">
      <div class="cover"><div class="label"><div class="small">${Math.floor(k / 100)}${ageText(cover.takenAt) ? " · " + esc(ageText(cover.takenAt)) : ""}</div><div class="big">${MONTHS[k % 100]}</div></div></div>
      <div class="grid"></div></section>`);
    const coverImg = lazyImg(cover, 1200); $(".cover", sec).prepend(coverImg); if (cover.rot) $(".cover", sec).classList.add("rot" + cover.rot);
    $(".cover", sec).onclick = () => (ui.selecting ? null : openViewer(items, items.indexOf(cover)));
    const grid = $(".grid", sec);
    for (const it of list) {
      if (it === cover) continue;
      const t = el(`<div class="tile ${ui.picked.has(it.id) ? "picked" : ""} ${it.rot ? "rot" + it.rot : ""}">${it.video ? `<span class="chip">${svg("video")}${fmtDur(it.duration)}</span>` : ""}${it.fav ? `<svg class="heart" viewBox="0 0 24 24" fill="#fff"><path d="${ICON.heart}"/></svg>` : ""}${ui.selecting ? `<span class="sel"></span>` : ""}</div>`);
      t.prepend(lazyImg(it, 400));
      t.onclick = () => {
        if (ui.selecting) { ui.picked.has(it.id) ? ui.picked.delete(it.id) : ui.picked.add(it.id); t.classList.toggle("picked"); $(".topbar .grow span")?.replaceChildren(document.createTextNode(ui.picked.size ? ui.picked.size + " selected" : "Select items")); renderSelectionTray(); }
        else openViewer(items, items.indexOf(it));
      };
      grid.append(t);
    }
    main.append(sec);
  }
  root.append(main);

  // Which month is on screen: highlight it in the capsule.
  const monthObs = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) {
      const k = Number(e.target.dataset.k);
      if (Math.floor(k / 100) !== ui.year) { ui.year = Math.floor(k / 100); const y = $("#year"); if (y) y.firstChild.textContent = ui.year; }
      document.querySelectorAll("#months button").forEach((b) => b.classList.toggle("on", Number(b.dataset.k) === k));
      document.querySelector(`#months button[data-k="${k}"]`)?.scrollIntoView({ inline: "center", block: "nearest" });
    }
  }, { rootMargin: "-30% 0px -60% 0px" });
  main.querySelectorAll(".month").forEach((s) => monthObs.observe(s));
}

function renderSelectionTray() {
  document.querySelector(".nav.tray")?.remove();
  if (!ui.selecting || !ui.picked.size) return;
  const tray = el(`<div class="nav tray"><div class="tabs glass" style="justify-content:space-around">
    <button id="t-share">${svg("share")}Share</button><button id="t-del" style="color:var(--danger)">${svg("trash")}Delete</button></div></div>`);
  $("#t-del", tray).onclick = () => confirmDelete([...ui.picked]);
  $("#t-share", tray).onclick = () => shareItems([...ui.picked].map((id) => byId.get(id)).filter(Boolean));
  root.append(tray);
}

function filterMenu(anchor) {
  const set = (k, v) => { ui[k] = v; store.set(k, v); render(); };
  openMenu(anchor, [
    { label: "Photos and videos", on: ui.kind === "both", run: () => set("kind", "both") },
    { label: "Photos only", on: ui.kind === "photos", run: () => set("kind", "photos") },
    { label: "Videos only", on: ui.kind === "videos", run: () => set("kind", "videos") },
    "-",
    { label: "Everything", on: ui.show === "all", run: () => set("show", "all") },
    { label: "Liked", on: ui.show === "liked", run: () => set("show", "liked") },
    { label: "Favourites", on: ui.show === "fav", run: () => set("show", "fav") },
    { label: "Disliked", on: ui.show === "disliked", run: () => set("show", "disliked") },
    { label: "Not sorted yet", on: ui.show === "unsorted", run: () => set("show", "unsorted") },
    "-",
    { label: "Bigger squares", run: () => set("cols", Math.max(2, ui.cols - 1)) },
    { label: "Smaller squares", run: () => set("cols", Math.min(6, ui.cols + 1)) },
  ]);
}

function renderMemories() {
  const main = el(`<main style="padding-top:calc(var(--safe-top) + 24px)"><div class="page-title">Memories</div></main>`);
  const now = new Date();
  const onThisDay = state.items.filter((i) => { const d = new Date(i.takenAt); return !i.montage && d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() < now.getFullYear(); });
  if (onThisDay.length) {
    main.append(el(`<div class="section-title">On This Day</div>`));
    const yrs = now.getFullYear() - new Date(onThisDay[0].takenAt).getFullYear();
    const c = el(`<div class="otd"><div class="label">${yrs} year${yrs === 1 ? "" : "s"} ago</div></div>`);
    c.prepend(lazyImg(onThisDay.find((i) => !i.video) || onThisDay[0], 1200));
    c.onclick = () => openViewer(onThisDay, 0);
    main.append(c);
  }
  const montages = state.items.filter((i) => i.montage);
  main.append(el(`<div class="section-title">Montages</div>`));
  if (!montages.length) main.append(el(`<p class="small-print">Montages made in the Android app appear here.</p>`));
  const strip = el(`<div class="strip"></div>`);
  montages.forEach((m, i) => {
    const t = el(`<div class="card-tile"><div class="tile"><span class="chip">${svg("video")}${fmtDur(m.duration)}</span></div><div class="name">${esc(m.name.replace(/\.mp4$/i, "").replace(/^.*? – /, ""))}</div></div>`);
    $(".tile", t).prepend(lazyImg(m, 600));
    t.onclick = () => openViewer(montages, i);
    strip.append(t);
  });
  main.append(strip);
  const favs = state.items.filter((i) => i.fav && !i.montage);
  if (favs.length) {
    main.append(el(`<div class="section-title">Favourites</div>`));
    const g = el(`<div class="grid" style="--cols:3;margin:0 6px"></div>`);
    favs.forEach((f, i) => { const t = el(`<div class="tile"></div>`); t.append(lazyImg(f, 400)); t.onclick = () => openViewer(favs, i); g.append(t); });
    main.append(g);
  }
  root.append(main);
}

function renderSettings() {
  const main = el(`<main style="padding-top:calc(var(--safe-top) + 12px)">
    <div class="toprow" style="margin:0 4px 14px"><button class="round glass" id="back">${svg("back")}</button></div>
    <div class="page-title">Settings</div>
    <div class="section-title" style="font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-top:18px">Your album</div>
    <div class="list">
      <div class="item"><div class="grow"><div class="t">${state.items.filter((i) => !i.montage).length} photos and videos</div><div class="s">In the “${esc(CFG.folderName)}” folder in Google Drive</div></div><button class="round glass" id="reload" aria-label="Reload">${svg("refresh")}</button></div>
      <div class="item"><div class="grow"><div class="t">${esc(CFG.childName)}'s birthday</div><div class="s">For the age under each month. Kept on this phone only.</div></div><input type="date" id="bday" value="${esc(store.get("birthday") || "")}" style="background:var(--card-2);color:var(--text);border:0;border-radius:10px;padding:8px"></div>
      <button class="item" id="bring" style="text-align:left;width:100%"><div class="grow"><div class="t">Bring in photos added outside the app</div><div class="s">${state.outside.length ? state.outside.length + " in the Drive folder aren't in the album yet" : "For photos and videos put in the Drive folder another way, like the Google Drive app"}</div></div>${svg("down", "i chev")}</button>
    </div>
    <div class="section-title" style="font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">Account</div>
    <div class="list">
      <div class="item"><div class="grow"><div class="t">Signed in</div><div class="s" id="who">Google account</div></div><button class="btn secondary" id="out" style="height:40px">Sign out</button></div>
    </div>
    <p class="small-print">Moeski's Moments web ${VERSION}. Adding photos follows the same rules as the Android app: the date each was taken, and no duplicates or near-identical shots. Montages are made in the Android app. Pictures: ${esc(thumbs.mode || "not loaded yet")}.</p>
  </main>`);
  $("#back", main).onclick = () => { ui.tab = "album"; render(); };
  $("#reload", main).onclick = () => { store.del("folder"); refresh(); toast("Reloading the album…"); };
  $("#bday", main).onchange = (e) => { store.set("birthday", e.target.value || null); };
  $("#out", main).onclick = () => auth.signOut();
  $("#bring", main).onclick = bringIn;
  api("/about?fields=user(emailAddress,displayName)").then((r) => { const e = r?.user?.emailAddress; if (e) { store.set("email", e); $("#who", main).textContent = e; } }).catch(() => {});
  root.append(main);
}

// ---------- menus and sheets ----------
function openMenu(anchor, entries) {
  closeMenus();
  const scrim = el(`<div class="scrim" style="background:transparent"></div>`);
  const menu = el(`<div class="menu"></div>`);
  for (const e of entries) {
    if (e === "-") { menu.append(el("<hr>")); continue; }
    const b = el(`<button style="${e.danger ? "color:var(--danger)" : ""}">${e.icon ? svg(e.icon) : ""}<span>${esc(e.label)}</span>${e.on ? `<span class="tick">${svg("check")}</span>` : ""}</button>`);
    b.onclick = () => { closeMenus(); e.run(); };
    menu.append(b);
  }
  scrim.onclick = closeMenus;
  document.body.append(scrim, menu);
  const r = anchor.getBoundingClientRect();
  const left = Math.min(Math.max(8, r.right - menu.offsetWidth), innerWidth - menu.offsetWidth - 8);
  const top = r.bottom + 8 + menu.offsetHeight > innerHeight ? Math.max(8, r.top - menu.offsetHeight - 8) : r.bottom + 8;
  Object.assign(menu.style, { left: left + "px", top: top + "px" });
}
function closeMenus() { document.querySelectorAll(".menu, .scrim:not(.sheet-scrim)").forEach((n) => n.remove()); }

function openSheet(html, { closable = true } = {}) {
  closeSheet();
  const scrim = el(`<div class="scrim sheet-scrim"></div>`);
  const sheet = el(`<div class="sheet"><div class="grab"></div></div>`);
  sheet.append(el(html));
  if (closable) scrim.onclick = closeSheet;
  document.body.append(scrim, sheet);
  return sheet;
}
function closeSheet() { document.querySelectorAll(".sheet, .sheet-scrim").forEach((n) => n.remove()); }

function confirmDelete(ids, after) {
  const n = ids.length;
  const sheet = openSheet(`<div><h2>Delete ${n === 1 ? "this" : n + " items"}?</h2>
    <p>${n === 1 ? "It goes" : "They go"} to the bin in Google Drive, where ${n === 1 ? "it" : "they"} can be restored for 30 days. ${n === 1 ? "It's" : "They're"} removed from the album for everyone.</p>
    <div class="row end"><button class="btn secondary" id="no">Cancel</button><button class="btn danger" id="yes">Delete</button></div></div>`);
  $("#no", sheet).onclick = closeSheet;
  $("#yes", sheet).onclick = async () => {
    $("#yes", sheet).disabled = true;
    let ok = 0;
    for (const id of ids) { try { await trash(id); ok++; state.items = state.items.filter((i) => i.id !== id); byId.delete(id); } catch {} }
    store.set("items", state.items);
    closeSheet(); ui.selecting = false; ui.picked.clear();
    toast(ok === n ? `Deleted ${n === 1 ? "" : n}`.trim() : `Deleted ${ok} of ${n}`);
    after?.(); render();
  };
}

async function shareItems(items) {
  if (!items.length) return;
  toast(items.length === 1 ? "Getting it ready…" : `Getting ${items.length} ready…`, 6000);
  try {
    const files = [];
    for (const it of items) {
      const r = await fetch("media/" + it.id);
      if (!r.ok) throw new Error("download failed");
      files.push(new File([await r.blob()], it.name, { type: it.mime }));
    }
    document.querySelectorAll(".toast").forEach((t) => t.remove());
    if (navigator.canShare?.({ files })) await navigator.share({ files });
    else for (const f of files) { const a = el(`<a download="${esc(f.name)}"></a>`); a.href = URL.createObjectURL(f); a.click(); }
  } catch (e) { if (e.name !== "AbortError") toast("Couldn't share: " + e.message); }
}

// ---------- the photo / video viewer ----------
function openViewer(list, index) {
  if (index < 0) return;
  let i = index;
  const v = el(`<div class="viewer">
    <div class="stage"></div>
    <div class="vtop"><button class="round" id="v-back">${svg("back")}</button><div class="when"></div><button class="round" id="v-more">${svg("more")}</button></div>
    <div class="vbottom glass">
      <button id="v-fav"></button><button id="v-like" class="like">${svg("up")}Like</button><button id="v-dis" class="dislike">${svg("downThumb")}Dislike</button><button id="v-share">${svg("share")}Share</button>
    </div></div>`);
  document.body.append(v);
  document.body.style.overflow = "hidden";
  const stage = $(".stage", v);
  const close = () => { v.remove(); document.body.style.overflow = ""; render(); };

  function show() {
    const it = list[i];
    stage.innerHTML = "";
    stage.style.transform = "";
    stage.className = "stage" + (it.rot ? " rot" + it.rot : "");
    const d = new Date(it.takenAt);
    $(".when", v).textContent = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long", year: "numeric" }) + ", " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    $("#v-fav", v).className = "fav" + (it.fav ? " on" : ""); $("#v-fav", v).innerHTML = svg(it.fav ? "heart" : "heartO") + "Favourite";
    $("#v-like", v).classList.toggle("on", it.like === true);
    $("#v-dis", v).classList.toggle("on", it.like === false);
    if (it.video) {
      const vid = el(`<video controls playsinline preload="metadata"></video>`);
      const poster = thumbs.urls.get(it.id + "@1200") || thumbs.urls.get(it.id + "@400");
      if (poster) vid.poster = poster;
      const spin = el(`<div class="spinner"></div>`);
      stage.append(vid, spin);
      const stillHere = () => vid.isConnected;
      vid.addEventListener("playing", () => spin.remove());
      vid.addEventListener("loadeddata", () => spin.remove());
      // Plan B: download the whole video, then play it from the phone's memory.
      let triedWhole = false;
      const playWhole = async () => {
        if (triedWhole || !stillHere()) return;
        triedWhole = true;
        try {
          const r = await fetch(`https://www.googleapis.com/drive/v3/files/${it.id}?alt=media`, { headers: { Authorization: "Bearer " + auth.token } });
          if (!r.ok) throw new Error("Drive said " + r.status);
          const blob = new Blob([await r.blob()], { type: it.mime === "video/quicktime" ? "video/quicktime" : "video/mp4" });
          if (!stillHere()) return;
          vid.src = URL.createObjectURL(blob);
          vid.play().catch(() => {});
        } catch (e) { spin.remove(); if (stillHere()) toast("Couldn't play this video: " + e.message); }
      };
      vid.addEventListener("error", playWhole);
      if (navigator.serviceWorker?.controller) {
        // Streams through the service worker, which adds the sign-in and handles skipping through.
        vid.src = `media/${it.id}?size=${it.size || 0}&type=${encodeURIComponent(it.mime)}`;
        vid.play().catch(() => {});
      } else playWhole();
    } else {
      const poster = lazyImg(it, 1600, "poster");
      const spin = el(`<div class="spinner"></div>`);
      stage.append(poster, spin);
      const full = new Image();
      full.onload = () => { poster.replaceWith(full); spin.remove(); };
      full.onerror = () => spin.remove();
      full.src = "media/" + it.id;
    }
  }
  const go = (d) => { const n = i + d; if (n >= 0 && n < list.length) { i = n; show(); } };
  const toggle = async (field, value) => {
    const it = list[i];
    const before = it[field];
    it[field] = value;
    show();
    try {
      if (field === "fav") await setProps(it.id, { fav: value ? "1" : null });
      else await setProps(it.id, { like: value === true ? "1" : value === false ? "0" : null });
      store.set("items", state.items);
    } catch (e) { it[field] = before; show(); toast("Couldn't save that: " + e.message.slice(0, 80)); }
  };
  $("#v-back", v).onclick = close;
  $("#v-fav", v).onclick = () => toggle("fav", !list[i].fav);
  $("#v-like", v).onclick = () => toggle("like", list[i].like === true ? null : true);
  $("#v-dis", v).onclick = () => toggle("like", list[i].like === false ? null : false);
  $("#v-share", v).onclick = () => shareItems([list[i]]);
  $("#v-more", v).onclick = (e) => openMenu(e.currentTarget, [
    { label: "Save to phone", icon: "share", run: () => shareItems([list[i]]) },
    { label: "Delete", icon: "trash", danger: true, run: () => confirmDelete([list[i].id], () => { list.splice(i, 1); if (!list.length) close(); else { i = Math.min(i, list.length - 1); show(); } }) },
  ]);

  // Swipe left/right between photos, down to close; tap to hide the buttons.
  let sx = 0, sy = 0, dx = 0, dy = 0, touching = false, moved = false;
  stage.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || e.target.tagName === "VIDEO" && e.touches[0].clientY > innerHeight - 140) return;
    touching = true; moved = false; sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = dy = 0;
  }, { passive: true });
  stage.addEventListener("touchmove", (e) => {
    if (!touching) return;
    dx = e.touches[0].clientX - sx; dy = e.touches[0].clientY - sy;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) moved = true;
    if (dy > 0 && Math.abs(dy) > Math.abs(dx)) { const s = 1 - Math.min(dy / innerHeight, 0.4); stage.style.transform = `translate(${dx * 0.3}px, ${dy}px) scale(${s})`; v.style.background = `rgba(0,0,0,${1 - Math.min(dy / 400, 0.9)})`; }
    else if (Math.abs(dx) > Math.abs(dy)) stage.style.transform = `translateX(${dx}px)`;
  }, { passive: true });
  stage.addEventListener("touchend", () => {
    if (!touching) return; touching = false;
    v.style.background = "";
    if (!moved) { v.classList.toggle("bare"); return; }
    if (dy > 120 && dy > Math.abs(dx)) return close();
    if (dx < -70) return go(1);
    if (dx > 70) return go(-1);
    stage.style.transition = "transform .18s"; stage.style.transform = ""; setTimeout(() => (stage.style.transition = ""), 200);
  });
  document.addEventListener("keydown", function key(e) {
    if (!v.isConnected) return document.removeEventListener("keydown", key);
    if (e.key === "ArrowRight") go(1); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "Escape") close();
  });
  show();
}

// Pinch the album to change how many squares fit in a row (Safari's own gesture events).
let pinchStart = 3;
document.addEventListener("gesturestart", (e) => { if (ui.tab !== "album" || document.querySelector(".viewer")) return; e.preventDefault(); pinchStart = ui.cols; });
document.addEventListener("gesturechange", (e) => {
  if (ui.tab !== "album" || document.querySelector(".viewer")) return;
  e.preventDefault();
  const want = Math.min(6, Math.max(2, Math.round(pinchStart / e.scale)));
  if (want !== ui.cols) { ui.cols = want; store.set("cols", want); document.documentElement.style.setProperty("--cols", want); }
});

// ---------- start ----------
(async function start() {
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("sw.js"); } catch {}
    navigator.serviceWorker.ready.then(shareTokenWithWorker);
  }
  const back = auth.fromRedirect();
  const ret = JSON.parse(sessionStorage.getItem("moeski.return") || "null");
  sessionStorage.removeItem("moeski.return");
  if (ret?.tab) ui.tab = ret.tab;
  if (back && back !== "ok") {
    // A quiet sign-in didn't work (signed out of Google, or first time): ask properly.
    store.del("auth");
    root.innerHTML = ""; renderSignIn(back === "access_denied" ? "Sign-in was cancelled. Try again when you're ready." : null);
    return;
  }
  if (!auth.token) {
    if (store.get("auth")) { auth.signIn(true); return; } // signed in before: renew quietly
    root.innerHTML = ""; renderSignIn(); return;
  }
  shareTokenWithWorker();
  render();
  if (ret?.scroll) requestAnimationFrame(() => scrollTo(0, ret.scroll));
  await refresh();
  if (sessionStorage.getItem("moeski.resume") === "bringIn") bringIn();
  // Renew the access quietly before it runs out, if the app is left open.
  setInterval(() => { if (auth.minutesLeft < 5 && !document.querySelector(".sheet")) auth.signIn(true); }, 60_000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { if (!auth.token) auth.signIn(true); else refresh(true); } });
})();
