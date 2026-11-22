/* دليل بلدي - Firebase integration: shared likes, moderated comments, push, admin panel.
   Requires firebase-app/auth/firestore/messaging compat SDKs loaded before this file. */
(function(){
'use strict';

const firebaseConfig = {
  apiKey: "AIzaSyBcL6UF3z10fv5dU2oL7mjb02EQ8qPnE-8",
  authDomain: "dalil-baladi.firebaseapp.com",
  projectId: "dalil-baladi",
  storageBucket: "dalil-baladi.firebasestorage.app",
  messagingSenderId: "402649416218",
  appId: "1:402649416218:web:5ce7b1c8d6e9856e4a07a3"
};
const VAPID_KEY = "BN3uh5NsxSgQmRGGkNH5AmMkz3jfb3DVqbxAZtP-6-49U93505M_lyccm1TkR0_VRjZR7InOh4rXSaEsbD_QnqQ";
const ADMIN_UID = "tGb0cMd4YfWlLkL8qAwRIHddRV32";

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* Anonymous auth gives every device a stable, unforgeable uid used for like ownership. */
let uid = null;
const authReady = new Promise(res=>{
  auth.onAuthStateChanged(u=>{ uid = u ? u.uid : null; if(u) res(); else auth.signInAnonymously().catch(err=>console.warn('anon auth',err)); });
});


/* ---------- device id (for own-like toggle) ---------- */
function deviceId(){
  let id = localStorage.getItem('dalil_baladi_device');
  if(!id){ id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+'-'+Math.random().toString(36).slice(2)); localStorage.setItem('dalil_baladi_device', id); }
  return id;
}

/* ---------- Firestore-backed content overlay ----------
   Static data.json stays as the base; published Firestore docs override/extend. */
/* Device-local news unread state. First snapshot is a baseline, not a fake backlog. */
const NEWS_SEEN_KEY='dalil_news_seen_v1',NEWS_UNREAD_KEY='dalil_news_unread_v1';
function readNewsSet(key){try{const v=JSON.parse(localStorage.getItem(key));return Array.isArray(v)?new Set(v):null;}catch(e){return null;}}
let knownNews=readNewsSet(NEWS_SEEN_KEY),unreadNews=readNewsSet(NEWS_UNREAD_KEY)||new Set(),visibleNews=[];
function persistNewsState(){try{localStorage.setItem(NEWS_SEEN_KEY,JSON.stringify([...knownNews].slice(-2000)));localStorage.setItem(NEWS_UNREAD_KEY,JSON.stringify([...unreadNews]));}catch(e){}}
function updateUnreadUI(){
 const button=document.getElementById('unreadNews');if(!button)return;
 const n=unreadNews.size;button.hidden=n===0;button.textContent=n>99?'99+':String(n);
 button.setAttribute('aria-label',n+' أخبار جديدة لم تُفتح في قسم الأخبار على هذا الجهاز');
 button.title='أخبار جديدة على هذا الجهاز، افتح قسم الأخبار لقراءتها. ليس عداد وصول الإشعارات.';
}
function markNewsOpened(){if(!knownNews)return;visibleNews.forEach(id=>{knownNews.add(id);unreadNews.delete(id);});persistNewsState();updateUnreadUI();}
function trackPublishedNews(ids){
 visibleNews=ids;const published=new Set(ids);
 if(knownNews===null){knownNews=new Set(ids);unreadNews.clear();}
 else ids.forEach(id=>{if(!knownNews.has(id)){knownNews.add(id);unreadNews.add(id);}});
 unreadNews.forEach(id=>{if(!published.has(id))unreadNews.delete(id);});
 if(document.visibilityState==='visible'&&document.querySelector('.tab.active[data-view="news"]'))markNewsOpened();
 else{persistNewsState();updateUnreadUI();}
}
function initUnreadNews(){
 document.getElementById('unreadNews')?.addEventListener('click',()=>showView('news'));
 window.addEventListener('dalil:view',e=>{if(e.detail==='news')markNewsOpened();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&document.querySelector('.tab.active[data-view="news"]'))markNewsOpened();});
 updateUnreadUI();
}

const fsNews = new Map(), fsShops = new Map();
let onOverlayChange = null;

function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function watchContent(){
  db.collection('news').where('published','==',true).onSnapshot({includeMetadataChanges:true},snap=>{
    fsNews.clear();
    snap.forEach(d=>fsNews.set(d.id, Object.assign({fsId:d.id}, d.data())));
    if(!snap.metadata.fromCache)trackPublishedNews(snap.docs.map(d=>d.id));
    if(onOverlayChange) onOverlayChange();
  }, err=>console.warn('news watch', err));
  db.collection('shops').where('published','==',true).onSnapshot(snap=>{
    fsShops.clear();
    snap.forEach(d=>fsShops.set(d.id, Object.assign({fsId:d.id}, d.data())));
    if(onOverlayChange) onOverlayChange();
  }, err=>console.warn('shops watch', err));
}

/* Merge Firestore items into already-rendered static lists.
   Firestore cards carry .fs-card and are rebuilt on every snapshot. */
function renderOverlay(){
  document.querySelectorAll('.fs-card').forEach(el=>el.remove());
  // NEWS
  const newsEl = document.getElementById('newsList');
  const homeEl = document.getElementById('homeNews');
  const newsItems = [...fsNews.values()].sort((a,b)=>((b.createdAt&&b.createdAt.seconds)||0)-((a.createdAt&&a.createdAt.seconds)||0));
  const newsHTML = newsItems.map(n=>postCard({
    id:n.itemId||('news-'+n.fsId), title:n.sourceTitle||'دليل بلدي', sub:(n.sub||'')+(n.date?' · '+n.date:''),
    headline:n.title||'', text:n.text||'', url:n.url||'', srcNote:n.srcNote||'', imageData:n.imageData||'', demo:false
  }).replace('article class="card"','article class="card fs-card"')).join('');
  if(newsEl) newsEl.insertAdjacentHTML('afterbegin', newsHTML);
  if(homeEl) homeEl.insertAdjacentHTML('afterbegin', newsHTML);
  // SHOPS
  const shopsEl = document.getElementById('shopsList');
  if(shopsEl && fsShops.size){
    const shopHTML = [...fsShops.values()].map(s=>postCard({
      id:'shop-'+s.fsId, title:s.name||'', sub:(s.category||'')+' · الخشاشنه والمرساه',
      text:(s.desc||''), imageData:s.imageData||'',
      contacts: (typeof shopContactsHTML==='function') ? shopContactsHTML(s) : '',
      demo:false
    }).replace('article class="card"','article class="card fs-card"')).join('');
    shopsEl.insertAdjacentHTML('afterbegin', shopHTML);
  }
  [newsEl, homeEl, shopsEl].forEach(el=>{ if(el) bindActions(el); });
  enhanceCards();
}

/* ---------- shared likes ---------- */
const likeCounts = new Map(); // itemId -> count
function watchLikes(itemId){
  db.collection('likes').doc(itemId).collection('devices').onSnapshot(snap=>{
    likeCounts.set(itemId, snap.size);
    updateLikeUI(itemId);
  }, ()=>{});
}
function updateLikeUI(itemId){
  const likes = getLikes();
  const liked = !!likes[itemId];
  const count = likeCounts.get(itemId);
  document.querySelectorAll('.like-btn[data-id="'+CSS.escape(itemId)+'"]').forEach(btn=>{
    btn.classList.toggle('liked', liked);
    const span = btn.querySelector('span');
    if(span) span.textContent = (liked?'أعجبك':'أعجبني') + (count? ' ('+count+')' : '');
  });
}
async function toggleLike(itemId){
  await authReady;
  const likes = getLikes();
  const ref = db.collection('likes').doc(itemId).collection('devices').doc(uid || deviceId());
  try{
    if(likes[itemId]){ await ref.delete(); delete likes[itemId]; }
    else { await ref.set({at: firebase.firestore.FieldValue.serverTimestamp()}); likes[itemId]=1; }
    setLikes(likes);
    updateLikeUI(itemId);
  }catch(e){ console.warn('like failed', e); }
}

/* ---------- comments ---------- */
/* Profanity/insult blocklist chosen by the admin (owner delegated the choice).
   Enforced again in Firestore rules, so bypassing the client does not help. */
const BANNED_WORDS = ['خول','متناك','شرموط','شرموطة','قحبة','قحبه','عرص','منيوك','كسم','زب','طيز','نيك','عاهرة','دعارة','لعنة'];
const BANNED_RE = new RegExp('(^|[^\\u0621-\\u064A])(' + BANNED_WORDS.join('|') + ')(?![\\u0621-\\u064A])');
function hasBanned(s){ return BANNED_RE.test(s); }
function commentThreadHTML(itemId){
  return '<div class="comment-thread" data-item="'+esc(itemId)+'">' +
    '<div class="comment-list"></div>' +
    '<form class="comment-form">' +
      '<input type="text" name="name" maxlength="50" placeholder="اسمك" required>' +
      '<input type="text" name="text" maxlength="500" placeholder="اكتب تعليقًا..." required>' +
      '<button type="submit">إرسال</button>' +
    '</form>' +
    '<div class="comment-note">التعليقات بتتنشر فورًا، والكلام المسيء بيترفض تلقائيًا.</div>' +
  '</div>';
}
function loadComments(itemId, listEl){
  db.collection('comments').where('itemId','==',itemId).where('approved','==',true)
    .orderBy('createdAt','desc').limit(20)
    .onSnapshot(snap=>{
      listEl.innerHTML = snap.docs.map(d=>{
        const c = d.data();
        return '<div class="comment"><b>'+esc(c.name)+'</b> '+esc(c.text)+'</div>';
      }).join('') || '<div class="comment-empty">مفيش تعليقات لسه.</div>';
    }, ()=>{ listEl.innerHTML=''; });
}
function bindCommentForms(root){
  root.querySelectorAll('.comment-form').forEach(form=>{
    if(form.__bound) return; form.__bound = true;
    form.addEventListener('submit', async e=>{
      e.preventDefault();
      const itemId = form.closest('.comment-thread').dataset.item;
      const name = form.elements.namedItem('name').value.trim();
      const text = form.elements.namedItem('text').value.trim();
      const note = form.closest('.comment-thread').querySelector('.comment-note');
      if(!name || !text) return;
      if(hasBanned(name) || hasBanned(text)){
        note.textContent = 'التعليق فيه كلام مسيء، مش هيتحق منه النشر.';
        return;
      }
      try{
        await authReady;
        await db.collection('comments').add({
          itemId, name, text, approved:true,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        form.elements.namedItem('text').value='';
        note.textContent = 'اتنشر تعليقك ✓';
      }catch(err){ console.warn('comment failed', err); note.textContent = 'حصل خطأ، جرب تاني.'; }
    });
  });
}

/* Shared like count, comment count and share count per item. */
const commentCounts = new Map(), shareCounts = new Map();
function watchCommentsCount(itemId){
  db.collection('comments').where('itemId','==',itemId).where('approved','==',true)
    .onSnapshot(snap=>{
      commentCounts.set(itemId, snap.size);
      const n = snap.size;
      document.querySelectorAll('.comment-btn[data-id="'+CSS.escape(itemId)+'"] span')
        .forEach(s=>{ s.textContent = n ? 'تعليق ('+n+')' : 'تعليق'; });
    }, ()=>{});
}
function watchShares(itemId){
  db.collection('shares').doc(itemId).collection('devices').onSnapshot(snap=>{
    shareCounts.set(itemId, snap.size);
    const n = snap.size;
    document.querySelectorAll('.share-btn[data-id="'+CSS.escape(itemId)+'"] span')
      .forEach(s=>{ s.textContent = n ? 'مشاركة ('+n+')' : 'مشاركة'; });
  }, ()=>{});
}
async function recordShare(itemId){
  try{
    await authReady;
    await db.collection('shares').doc(itemId).collection('devices').doc(uid || deviceId())
      .set({at: firebase.firestore.FieldValue.serverTimestamp()});
  }catch(e){ console.warn('share count failed', e); }
}

/* Wire working like/comment/share buttons with shared counts. */
function enhanceCards(){
  document.querySelectorAll('article.card').forEach(card=>{
    if(card.__enhanced) return; card.__enhanced = true;
    const likeBtn = card.querySelector('.like-btn');
    if(!likeBtn) return;
    const itemId = likeBtn.dataset.id;
    // shared like
    const clone = likeBtn.cloneNode(true);
    likeBtn.parentNode.replaceChild(clone, likeBtn);
    clone.addEventListener('click', ()=>toggleLike(itemId));
    watchLikes(itemId);
    // comments
    const cbtn = card.querySelector('.comment-btn');
    if(cbtn){
      watchCommentsCount(itemId);
      const thread = document.createElement('div');
      thread.innerHTML = commentThreadHTML(itemId);
      const threadEl = thread.firstElementChild;
      threadEl.style.display = 'none';
      card.appendChild(threadEl);
      cbtn.addEventListener('click', ()=>{
        const open = threadEl.style.display !== 'none';
        threadEl.style.display = open ? 'none' : 'block';
        if(!open && !threadEl.__loaded){
          threadEl.__loaded = true;
          loadComments(itemId, threadEl.querySelector('.comment-list'));
          bindCommentForms(threadEl);
        }
      });
    }
    // shared share count: count button presses honestly (a press, not a completed send)
    const sbtn = card.querySelector('.share-btn');
    if(sbtn){
      watchShares(itemId);
      sbtn.addEventListener('click', ()=>recordShare(itemId));
    }
    // remove the local-only note
    const note = card.querySelector('.local-note');
    if(note) note.remove();
  });
}

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

/* ---------- push subscribe ---------- */
function recordPushRegistration(stage,code){
  try{localStorage.setItem('dalil_push_registration_check',JSON.stringify({stage,code:code||'',at:new Date().toISOString()}));}catch(e){}
}
async function subscribePush(ask=true){
  let stage='permission';
  if(!('Notification' in window)) return setPushUI('unsupported');
  const perm = ask ? await Notification.requestPermission() : Notification.permission;
  if(perm !== 'granted') return setPushUI('denied');
  try{
    stage='worker';
    const reg = await navigator.serviceWorker.register('sw.js',{updateViaCache:'none'});
    const messaging = firebase.messaging();
    stage='token';
    const token = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if(!token){recordPushRegistration('token','token-unavailable');return setPushUI('error');}
    stage='auth';await authReady;stage='store';
    await db.collection('pushTokens').doc(token).set({
      uid: auth.currentUser.uid,
      at: firebase.firestore.FieldValue.serverTimestamp(), ua: navigator.userAgent.slice(0,100)+' Dalil/17'
    });
    const previous=localStorage.getItem('dalil_baladi_push');
    if(previous && previous!==token){await db.collection('pushTokens').doc(previous).delete().catch(()=>{});}
    localStorage.setItem('dalil_baladi_push', token);
    recordPushRegistration('verified','');setPushUI('on');
  }catch(e){const code=String(e.code||e.name||'unknown').replace(/[^a-zA-Z0-9_/-]/g,'').slice(0,80);recordPushRegistration(stage,code);console.warn('push registration failed',stage,code);setPushUI('error');}
  finally{if(document.getElementById('pushDiagnosticModal')?.classList.contains('show'))pushDiagnostic();}
}
async function unsubscribePush(){
  const token=localStorage.getItem('dalil_baladi_push');
  try{
    await firebase.messaging().deleteToken();
    if(token)await db.collection('pushTokens').doc(token).delete().catch(e=>console.warn('stale subscription cleanup',e));
    localStorage.removeItem('dalil_baladi_push');setPushUI('off');
  }catch(e){console.warn('unsubscribe failed',e);setPushUI('error');}
}

function setPushUI(state){
  const btn = document.getElementById('pushBell');
  if(!btn) return;
  const map = {
    off:  ['🔔','فعّل الإشعارات', false],
    on:   ['🔔','الإشعارات مفعلة — اضغط للإيقاف', true],
    denied:['🔕','الإشعارات مرفوضة من المتصفح', false],
    unsupported:['🔕','المتصفح مش بيدعم الإشعارات', false],
    error:['🔔','التسجيل لم يكتمل، افتح فحص الإشعارات', false],
    checking:['⏳','جاري فحص تسجيل الإشعارات',false]
  };
  const [icon,label,on] = map[state]||map.off;
  const status={on:'نشطة',off:'غير نشطة',denied:'غير نشطة',unsupported:'غير مدعومة',checking:'جارٍ الفحص',error:'غير مؤكدة'}[state]||'غير مؤكدة';
  btn.innerHTML='<span aria-hidden="true">'+icon+'</span><small>'+status+'</small>';
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.classList.toggle('push-on', !!on);
  btn.dataset.state = state;
}
function initPushUI(){
  if('Notification' in window && firebase.messaging.isSupported()){
    firebase.messaging().onMessage(async payload=>{
      await pushTrace('foreground-sdk');
      if(Notification.permission!=='granted'){await pushTrace('foreground-permission-denied');return;}
      try{const reg=await navigator.serviceWorker.ready; const d=payload.data||{};
        await reg.showNotification(d.title||payload.notification?.title||'دليل بلدي',{body:d.body||payload.notification?.body||'',icon:'icon-192.png',dir:'rtl',data:{itemId:d.itemId||'',itemType:d.itemType||''}});
        await pushTrace('foreground-display-accepted');
      }catch(e){await pushTrace('foreground-display-error');}
    });
  }
  const btn = document.getElementById('pushBell');
  if(!btn) return;
  const saved=localStorage.getItem('dalil_baladi_push');
  if(saved && typeof Notification!=='undefined' && Notification.permission==='granted'){setPushUI('checking');subscribePush(false);}
  else setPushUI(typeof Notification!=='undefined' && Notification.permission==='denied'?'denied':'off');
  btn.addEventListener('click', ()=>{
    const st = btn.dataset.state;
    if(st==='checking')return;
    if(st === 'on') unsubscribePush(); else subscribePush();
  });
}

async function pushDiagnostic(){
  const lines=['نسخة الصفحة: 17'];
  const permission=typeof Notification==='undefined'?'unsupported':Notification.permission;
  lines.push('إذن المتصفح: '+({granted:'مسموح',denied:'مرفوض',default:'لم يتم الاختيار',unsupported:'غير مدعوم'}[permission]));
  try{
    const reg=await navigator.serviceWorker.getRegistration();
    lines.push('خدمة التطبيق: '+(reg?.active?'مفعلة':'غير مفعلة'));
    if(reg?.active){const version=await new Promise(resolve=>{const ch=new MessageChannel();ch.port1.onmessage=e=>resolve(e.data);reg.active.postMessage('DALIL_VERSION',[ch.port2]);setTimeout(()=>resolve('غير مؤكدة'),1200);});lines.push('نسخة خدمة الاستقبال: '+version);}
    const subscription=reg?await reg.pushManager.getSubscription():null;
    lines.push('اشتراك الجهاز: '+(subscription?'موجود':'غير موجود'));
    if(subscription?.options?.applicationServerKey){const key=btoa(String.fromCharCode(...new Uint8Array(subscription.options.applicationServerKey))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');lines.push('مفتاح الاشتراك: '+(key===VAPID_KEY?'مطابق':'غير مطابق'));}
    lines.push('التسجيل مع الإدارة: '+({on:'تم التحقق منه الآن',checking:'جارٍ التحقق الآن'}[document.getElementById('pushBell').dataset.state]||'لم يتم التحقق منه'));
    lines.push('نوع الجلسة: '+(auth.currentUser?.uid===ADMIN_UID?'إدارة':auth.currentUser?.isAnonymous?'زائر':'غير مؤكدة'));
    try{const check=JSON.parse(localStorage.getItem('dalil_push_registration_check'));if(check){const stages={permission:'إذن الإشعارات',worker:'تجهيز خدمة الاستقبال',token:'استخراج تسجيل الجهاز',auth:'تسجيل الجلسة',store:'حفظ التسجيل',verified:'تم التحقق'};lines.push('آخر فحص للتسجيل: '+(stages[check.stage]||'غير مكتمل')+(check.code?' · '+check.code:'')+' · '+new Date(check.at).toLocaleTimeString('ar-EG'));}}catch(e){}

  }catch(e){lines.push('الفحص لم يكتمل: '+e.message);}
  const events=await new Promise(resolve=>{setTimeout(()=>resolve(null),1500);let r;try{r=indexedDB.open('dalil-push-trace',1);}catch(e){resolve(null);return;}r.onupgradeneeded=()=>r.result.createObjectStore('events',{autoIncrement:true});r.onerror=()=>resolve(null);r.onsuccess=()=>{const d=r.result;try{const tx=d.transaction('events','readonly'),q=tx.objectStore('events').getAll();q.onsuccess=()=>{resolve(q.result);d.close();};q.onerror=()=>{resolve(null);d.close();};}catch(e){resolve(null);d.close();}};});
  lines.push('سجل الاستقبال البعيد على هذا الجهاز فقط:');
  const labels={'push-event':'وصل حدث دفع إلى الجهاز','background-sdk':'استلمه معالج الخلفية','background-display-observed':'وُجد إشعار الإرسال في قائمة النظام','background-display-unknown':'لم يؤكد الفحص وجود إشعار النظام','display-query-unavailable':'تعذر فحص قائمة إشعارات النظام','background-display-accepted':'قُبل طلب العرض بالخلفية','background-display-error':'فشل طلب العرض بالخلفية','foreground-sdk':'استلمه معالج الصفحة','foreground-permission-denied':'الإذن مرفوض أثناء الاستقبال','foreground-display-accepted':'قُبل طلب العرض بالصفحة','foreground-display-error':'فشل طلب العرض بالصفحة'};
  if(events===null)lines.push('السجل غير متاح');
  else if(!events.length)lines.push('لم يُسجل استقبال بعيد منذ إضافة هذا الفحص. لا يشمل المحاولات السابقة أو الاختبار المحلي.');
  else events.slice(-6).forEach(e=>lines.push(new Date(e.at).toLocaleTimeString('ar-EG')+' · '+(labels[e.kind]||'حدث استقبال')));
  document.getElementById('pushDiagnosticText').textContent=lines.join('\n');
}
function initPushDiagnostic(){
 const modal=document.getElementById('pushDiagnosticModal');
 const diagnosticOnly=new URLSearchParams(location.search).get('diagnostic')==='1';
 if(diagnosticOnly){document.getElementById('pushLocalTest').hidden=true;document.getElementById('pushLocalResult').hidden=true;document.getElementById('pushLocalTest').previousElementSibling.hidden=true;modal.classList.add('show');pushDiagnostic();}
 document.getElementById('pushDiagnosticOpen').addEventListener('click',()=>{modal.classList.add('show');pushDiagnostic();});
 document.getElementById('pushDiagnosticClose').addEventListener('click',()=>modal.classList.remove('show'));
 document.getElementById('pushLocalTest').addEventListener('click',async()=>{
  const status=document.getElementById('pushLocalResult');
  if(typeof Notification==='undefined'||Notification.permission!=='granted'){status.textContent='المتصفح لا يسمح بعرض الإشعارات الآن. هذا ليس اختبار إرسال من الإدارة.';return;}
  try{const reg=await navigator.serviceWorker.ready;await reg.showNotification('اختبار محلي - دليل بلدي',{body:'ده اختبار عرض من موبايلك فقط، مش إشعار مرسل من الإدارة.',icon:'icon-192.png',dir:'rtl',tag:'dalil-local-check'});status.textContent='المتصفح قبل طلب العرض المحلي. هل ظهر على الهاتف؟';}
  catch(e){status.textContent='العرض المحلي لم يكتمل: '+e.message;}
 });
}

/* ---------- admin ---------- */
function isAdmin(user){ return user && user.uid === ADMIN_UID; }

async function adminPhotoPatch(f){
  if(f.elements.namedItem('removePhoto')?.checked) return {imageData:''};
  const file=f.elements.namedItem('photo')?.files[0];
  if(!file)return {};
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('اختار صورة JPG أو PNG أو WebP.');
  if(file.size>8*1024*1024)throw new Error('اختار صورة أقل من 8 ميجابايت.');
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('الصورة لم تفتح، اختار صورة أخرى.'));im.src=url;});
    let max=1280, imageData='';
    for(let attempt=0;attempt<5;attempt++){
      const scale=Math.min(1,max/Math.max(img.width,img.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      imageData=canvas.toDataURL('image/jpeg',0.76-attempt*0.07);
      if(imageData.length<=210000)return {imageData};
      max=Math.round(max*0.75);
    }
    throw new Error('الصورة كبيرة بعد الضغط، اختار صورة أبسط.');
  }finally{URL.revokeObjectURL(url);}
}
async function saveAdminForm(f,coll,values){
  const button=f.querySelector('button[type=submit]'),notice=f.querySelector('.ok');
  button.disabled=true;notice.textContent='جاري الحفظ...';
  try{
    const editing=f.dataset.editId;
    const ref=editing?db.collection(coll).doc(editing):db.collection(coll).doc();
    const draft=!!f.elements.namedItem('draft')?.checked;
    const before=editing?(await ref.get()).data():null;
    const data={...values,...await adminPhotoPatch(f),published:!draft,notified:draft||!!(editing&&before?.published)};
    if(!editing)data.createdAt=firebase.firestore.FieldValue.serverTimestamp();
    await ref.set(data,{merge:true});
    f.reset();delete f.dataset.editId;button.textContent='حفظ';notice.style.color='#218b30';notice.textContent='اتحفظ ✓';
  }catch(error){notice.style.color='#c40020';notice.textContent=error.message||'الحفظ لم يكتمل، جرب تاني.';}
  finally{button.disabled=false;}
}

function initAdmin(){
  const entry = document.getElementById('adminEntry');
  const modal = document.getElementById('adminModal');
  const panel = document.getElementById('adminPanel');
  const loginForm = document.getElementById('adminLoginForm');
  const errEl = document.getElementById('adminLoginErr');
  if(!entry || !modal) return;

  entry.addEventListener('click', ()=>{
    modal.style.display = 'flex';
    const user = auth.currentUser;
    document.getElementById('adminLoginBox').style.display = isAdmin(user) ? 'none' : 'block';
    panel.style.display = isAdmin(user) ? 'block' : 'none';
    if(isAdmin(user)) loadAdminData();
  });
  document.getElementById('adminClose').addEventListener('click', ()=>{ modal.style.display='none'; });

  loginForm.addEventListener('submit', async e=>{
    e.preventDefault();
    errEl.textContent = '';
    try{
      const cred = await auth.signInWithEmailAndPassword(
        loginForm.elements.namedItem('email').value.trim(),
        loginForm.elements.namedItem('password').value);
      if(!isAdmin(cred.user)){
        await auth.signOut();
        errEl.textContent = 'الحساب ده مش حساب الإدارة.';
        return;
      }
      document.getElementById('adminLoginBox').style.display = 'none';
      panel.style.display = 'block';
      loadAdminData();
    }catch(err){
      errEl.textContent = 'بيانات الدخول غير صحيحة.';
    }
  });

  document.getElementById('adminLogout').addEventListener('click', async ()=>{
    await auth.signOut();
    auth.signInAnonymously().catch(()=>{});
    panel.style.display = 'none';
    document.getElementById('adminLoginBox').style.display = 'block';
  });

  // Owner-only content and photo publishing.
  document.getElementById('publishNews').addEventListener('submit',async e=>{
    e.preventDefault();const f=e.target;const value=n=>f.elements.namedItem(n).value.trim();
    await saveAdminForm(f,'news',{title:value('title'),text:value('text'),date:value('date'),url:value('url')});
  });
  document.getElementById('publishShop').addEventListener('submit',async e=>{
    e.preventDefault();const f=e.target;const value=n=>f.elements.namedItem(n).value.trim();
    await saveAdminForm(f,'shops',{name:value('name'),category:value('category'),desc:value('desc'),phone:value('phone'),whatsapp:value('whatsapp'),map:value('map')});
  });
}

function loadAdminData(){
  // latest comments across items; admin can delete anything that slipped through
  db.collection('comments').orderBy('createdAt','desc').limit(50)
    .onSnapshot(snap=>{
      document.getElementById('pendingComments').innerHTML = snap.docs.map(d=>{
        const c = d.data();
        return '<div class="admin-row" data-id="'+d.id+'">' +
          '<div><b>'+esc(c.name)+'</b> '+esc(c.text)+' <small>('+esc(c.itemId)+')</small></div>' +
          '<div><button class="reject" data-id="'+d.id+'">حذف</button></div></div>';
      }).join('') || '<div class="empty-msg">مفيش تعليقات لسه.</div>';
    });
  // manage content
  db.collection('news').orderBy('createdAt','desc').limit(30).onSnapshot(snap=>{
    document.getElementById('manageNews').innerHTML = snap.docs.map(d=>{
      const n = d.data();
      return '<div class="admin-row"><div>'+esc(n.title)+(n.published===false?' · مسودة خاصة':'')+'</div>' +
        (n.published===false?'':'<button class="notify-doc" data-coll="news" data-id="'+d.id+'">إرسال إشعار</button>')+'<button class="edit-doc" data-coll="news" data-id="'+d.id+'">تعديل</button><button class="del-doc" data-coll="news" data-id="'+d.id+'">حذف</button></div>';
    }).join('');
  });
  db.collection('shops').orderBy('createdAt','desc').limit(30).onSnapshot(snap=>{
    document.getElementById('manageShops').innerHTML = snap.docs.map(d=>{
      const s = d.data();
      return '<div class="admin-row"><div>'+esc(s.name)+(s.published===false?' · مسودة خاصة':'')+'</div>' +
        '<button class="edit-doc" data-coll="shops" data-id="'+d.id+'">تعديل</button><button class="del-doc" data-coll="shops" data-id="'+d.id+'">حذف</button></div>';
    }).join('');
  });
}

document.addEventListener('click', async e=>{
  const ap = e.target.closest('.approve');
  const rj = e.target.closest('.reject');
  const del = e.target.closest('.del-doc');
  const edit = e.target.closest('.edit-doc');
  const notify = e.target.closest('.notify-doc');
  try{
    if(notify && isAdmin(auth.currentUser)){
      await db.collection(notify.dataset.coll).doc(notify.dataset.id).update({notified:false});
      notify.textContent='في انتظار الإرسال'; notify.disabled=true;
    }
    if(edit && isAdmin(auth.currentUser)){
      const doc = await db.collection(edit.dataset.coll).doc(edit.dataset.id).get();
      const f = document.getElementById(edit.dataset.coll==='news'?'publishNews':'publishShop');
      const data=doc.data();f.reset();
      f.elements.namedItem('draft').checked=data.published===false;
      [...f.elements].forEach(el=>{if(el.type!=='file' && el.type!=='checkbox' && el.name && data[el.name]!=null) el.value=data[el.name];});
      f.dataset.editId=doc.id; f.querySelector('button[type=submit]').textContent='حفظ التعديل';
      f.scrollIntoView({block:'start'});
    }
    if(ap) await db.collection('comments').doc(ap.dataset.id).update({approved:true});
    if(rj) await db.collection('comments').doc(rj.dataset.id).delete();
    if(del) await db.collection(del.dataset.coll).doc(del.dataset.id).delete();
  }catch(err){ console.warn('admin action failed', err); }
});

/* ---------- boot ---------- */
window.addEventListener('load', ()=>{
  initUnreadNews();
  watchContent();
  onOverlayChange = renderOverlay;
  // static content renders async from data.json; overlay after a tick and again later
  setTimeout(renderOverlay, 1200);
  setTimeout(renderOverlay, 3500);
  initPushUI();
  initPushDiagnostic();
  initAdmin();
});

})();
