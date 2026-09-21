import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dist=path.resolve(process.argv[2]||'dist');
if(!fs.existsSync(dist))throw new Error(`Diretório de build não encontrado: ${dist}`);
const walk=(dir)=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);
const files=walk(dist).filter(file=>path.basename(file)!=='sw.js');
const assets=files.map(file=>'/'+path.relative(dist,file).split(path.sep).join('/')).filter(p=>!p.endsWith('.map')).sort();
const hash=crypto.createHash('sha256');for(const file of files.sort()){hash.update(path.relative(dist,file));hash.update(fs.readFileSync(file));}
const cache=`ponto-certo-${hash.digest('hex').slice(0,16)}`;
const sw=`const CACHE=${JSON.stringify(cache)};const ASSETS=${JSON.stringify(assets)};
self.addEventListener('push',event=>{let data;try{data=event.data?.json()}catch{return}if(!data||!data.title||(data.expiresAt&&Number(data.expiresAt)<=Date.now()))return;const url=String(data.url||'/?tab=home');event.waitUntil(self.registration.showNotification(String(data.title),{body:String(data.body||''),icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:String(data.tag||'ponto-notification'),data:{url},requireInteraction:false}));});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{const target=new URL(String(event.notification.data?.url||'/?tab=home'),self.location.origin).href;const client=clients.find(c=>new URL(c.url).origin===self.location.origin);if(client){await client.navigate(target);return client.focus()}return self.clients.openWindow(target);}));});
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('ponto-certo-')&&key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{const req=event.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==self.location.origin||req.headers.has('Authorization'))return;if(req.mode==='navigate'){event.respondWith(fetch(req).catch(()=>caches.open(CACHE).then(cache=>cache.match('/index.html'))));return}if(ASSETS.includes(url.pathname))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.pathname))||fetch(req)));});
`;
fs.writeFileSync(path.join(dist,'sw.js'),sw);
console.log(`PWA service worker gerado: ${cache} (${assets.length} arquivos)`);
