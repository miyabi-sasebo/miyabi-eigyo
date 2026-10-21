/* 営業記録アプリ：電波がなくても開けるように、画面のファイルと見た地図をiPhoneに保存しておく */
const CACHE = "miyabi-mobile-v2.1.0";
const TILE_CACHE = "miyabi-tiles-v1";  // 地図の絵（版が変わっても消さない）
const TILE_MAX = 6000;                 // 地図の絵をためておく上限（古いものから消す）
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-180.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== TILE_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

let tilePuts = 0;
async function trimTiles(cache) {
  if (++tilePuts % 100) return;
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - TILE_MAX; i++) await cache.delete(keys[i]);
}
// 地図の絵：保存してあればそれを出す。無ければ取りに行って保存する
async function tile(req) {
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  let res = null;
  try { res = await fetch(req.url, { mode: "cors", credentials: "omit" }); }
  catch (e) { try { res = await fetch(req); } catch (e2) { res = null; } }
  if (res && (res.ok || res.type === "opaque")) { cache.put(req.url, res.clone()).then(() => trimTiles(cache)).catch(() => {}); return res; }
  return res || new Response("", { status: 504 });
}

// まず保存しておいた画面を出す（すぐ開く）。電波があれば裏で新しい版を取りに行く
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "cyberjapandata.gsi.go.jp") { e.respondWith(tile(req)); return; }
  if (url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    return res || (req.mode === "navigate" ? cache.match("index.html") : Response.error());
  }));
});
