import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const directory = path.resolve(process.argv[2] || "dist");
const list = [];
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (!file.endsWith(".map") && !file.endsWith("sw.js")) list.push(file);
  }
}
const index = path.join(directory, "index.html");
let html = fs.readFileSync(index, "utf8");
if (!html.includes('rel="manifest"'))
  html = html.replace(
    "</head>",
    '<link rel="manifest" href="/manifest.webmanifest"/><meta name="theme-color" content="#244a7d"/><link rel="apple-touch-icon" href="/icons/icon-192.png"/></head>',
  );
html = html
  .replace(/<html[^>]*>/, '<html lang="pt-BR">')
  .replace(/<title>.*?<\/title>/, "<title>Ponto Certo</title>");
fs.writeFileSync(index, html);
scan(directory);
const version = crypto.createHash("sha256");
for (const file of list) version.update(fs.readFileSync(file));
const cache = `ponto-certo-${version.digest("hex").slice(0, 16)}`;
const files = list.map(
  (file) => "/" + path.relative(directory, file).split(path.sep).join("/"),
);
fs.writeFileSync(
  path.join(directory, "sw.js"),
  `const CACHE=${JSON.stringify(cache)};const ASSETS=${JSON.stringify(files)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('ponto-certo-')&&key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{const req=event.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==self.location.origin||req.headers.has('Authorization'))return;
if(req.mode==='navigate'){event.respondWith(fetch(req).catch(()=>caches.open(CACHE).then(cache=>cache.match('/index.html'))));return}
if(ASSETS.includes(url.pathname))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.pathname))||fetch(req)));
});
`,
);
console.log(`PWA ready: ${files.length} static assets, ${cache}`);
