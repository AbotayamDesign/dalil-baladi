function pushTrace(kind){
  return new Promise(resolve=>{
    setTimeout(resolve,1000);
    let req;try{req=indexedDB.open('dalil-push-trace',1);}catch(e){resolve();return;}
    req.onupgradeneeded=()=>req.result.createObjectStore('events',{autoIncrement:true});
    req.onerror=()=>resolve();
    req.onsuccess=()=>{const db=req.result;try{
      const tx=db.transaction('events','readwrite'),store=tx.objectStore('events');
      store.add({kind,at:new Date().toISOString()});
      const keys=store.getAllKeys();keys.onsuccess=()=>keys.result.slice(0,Math.max(0,keys.result.length-12)).forEach(k=>store.delete(k));
      tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();resolve();};
    }catch(e){db.close();resolve();}};
  });
}
self.addEventListener('push',event=>event.waitUntil(pushTrace('push-event')));
// Service worker for FCM background notifications - دليل بلدي
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBcL6UF3z10fv5dU2oL7mjb02EQ8qPnE-8",
  authDomain: "dalil-baladi.firebaseapp.com",
  projectId: "dalil-baladi",
  storageBucket: "dalil-baladi.firebasestorage.app",
  messagingSenderId: "402649416218",
  appId: "1:402649416218:web:5ce7b1c8d6e9856e4a07a3"
});

const messaging = firebase.messaging();

// Background message: show a notification that opens the specific item.
messaging.onBackgroundMessage(async (payload) => {
  await pushTrace('background-sdk');
  if(payload.notification){
    try{const shown=await self.registration.getNotifications();
      const id=payload.data?.itemId;
      await pushTrace(shown.some(n=>id&&n.data?.FCM_MSG?.data?.itemId===id)?'background-display-observed':'background-display-unknown');
    }catch(e){await pushTrace('display-query-unavailable');}
    return;
  } // Firebase displays notification payloads in the background.
  const data = payload.data || {};
  const title = data.title || 'دليل بلدي';
  const options = {
    body: data.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    data: { itemId: data.itemId || '', itemType: data.itemType || '' }
  };
  try{await self.registration.showNotification(title,options);await pushTrace('background-display-accepted');}
  catch(e){await pushTrace('background-display-error');}
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = (event.notification && event.notification.data) || {};
  let url = './';
  if (d.itemType === 'shop' && d.itemId) url = './#shop-' + d.itemId;
  else if (d.itemType === 'news' && d.itemId) url = './#news-' + d.itemId;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.navigate(url); return c.focus(); }
      }
      return clients.openWindow(url);
    })
  );
});
