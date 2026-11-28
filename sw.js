'use strict';
const CACHE='bukahyeon-dashboard-pwa-v4';
const ROOT=new URL('./',self.location.href);
const assets=['./','./assets/styles.css?v=20261128-chat-share','./assets/app.js?v=20261128-chat-buttons','./assets/pwa/pwa.css','./assets/pwa/pwa.js','./assets/pwa/qr.svg','./assets/pwa/icon-192.png','./assets/pwa/icon-512.png','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil((async()=>{const c=await caches.open(CACHE);await c.addAll(assets.map(p=>new Request(new URL(p,ROOT),{cache:'reload'})));await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('bukahyeon-dashboard-pwa-')&&key!==CACHE)await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{
 const r=event.request,u=new URL(r.url);
 if(r.method!=='GET'||u.origin!==ROOT.origin||!u.pathname.startsWith(ROOT.pathname))return;
 const home=r.mode==='navigate'&&(u.pathname===ROOT.pathname||u.pathname===ROOT.pathname+'index.html');
 if(!home&&!u.pathname.startsWith(ROOT.pathname+'assets/')&&!u.pathname.startsWith(ROOT.pathname+'data/')&&u.pathname!==ROOT.pathname+'manifest.webmanifest')return;
 event.respondWith((async()=>{
 const c=await caches.open(CACHE);const key=home?ROOT.href:r;
 try{const response=await fetch(new Request(r,{cache:'no-cache'}));if(response.ok){await c.put(key,response.clone()).catch(()=>{});if(home)notify(event,'PWA_ONLINE');return response}if(response.status<500)return response;throw Error('server unavailable')}
 catch(err){const saved=await c.match(key);if(saved){if(home)notify(event,'PWA_OFFLINE');return saved}return new Response('오프라인 상태입니다. 인터넷에 연결해 주세요.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})}
 })());
});
function notify(event,type){const id=event.resultingClientId||event.clientId;if(id)self.clients.get(id).then(c=>c?.postMessage({type})).catch(()=>{})}
