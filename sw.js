importScripts('./firebase-messaging-sw.js');
const CACHE_NAME='dalil-baladi-v24';
self.skipWaiting();
self.addEventListener('message', e=>{
 if(e.data==='DALIL_VERSION' && e.ports[0])e.ports[0].postMessage(CACHE_NAME);
 if(e.data==='DALIL_ACTIVATE') e.waitUntil(self.skipWaiting());
});
const ASSETS=['./','./index.html','./data.json','./manifest.webmanifest','./icon.svg','./app-firebase.js','./firebase-messaging-sw.js'];
self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
  e.respondWith(
    fetch(e.request,{cache:'no-cache'}).then(res=>{
      const copy=res.clone();
      caches.open(CACHE_NAME).then(c=>c.put(e.request,copy));
      return res;
    }).catch(()=>caches.match(e.request))
  );
});
