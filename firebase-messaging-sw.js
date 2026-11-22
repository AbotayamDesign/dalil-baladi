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
messaging.onBackgroundMessage((payload) => {
  if(payload.notification) return; // Firebase displays notification payloads in the background.
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
  return self.registration.showNotification(title, options);
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
