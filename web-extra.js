/* web-extra.js — ce qui est propre à la version WEB (installation, hors ligne, notifications, mises à jour) */
(() => {
  'use strict';
  const api = window.bioMaint, $ = s => document.querySelector(s);
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let deferred = null, reloading = false;

  /* ---------- Service worker : hors ligne + mises à jour automatiques ---------- */
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      setInterval(() => reg.update().catch(() => { }), 6 * 3600 * 1000);
    }).catch(() => { });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return; // première installation : rien à recharger
      showBar('🔄 Nouvelle version installée.', 'Recharger', () => { reloading = true; location.reload(); });
    });
  }

  /* ---------- Bandeau en bas (installation / mise à jour) ---------- */
  function showBar(text, btn, onClick, key) {
    $('#webbar')?.remove();
    const d = document.createElement('div'); d.id = 'webbar';
    d.innerHTML = `<span></span><button type="button" class="go"></button><button type="button" class="ghost x" aria-label="Fermer">✕</button>`;
    d.querySelector('span').textContent = text;
    const g = d.querySelector('.go'); btn ? (g.textContent = btn, g.onclick = onClick) : g.remove();
    d.querySelector('.x').onclick = () => { d.remove(); if (key) try { localStorage.setItem(key, Date.now()); } catch { } };
    document.body.appendChild(d);
  }
  const st = document.createElement('style');
  st.textContent = `#webbar{position:fixed;left:10px;right:10px;bottom:calc(64px + env(safe-area-inset-bottom));z-index:8;display:flex;gap:8px;align-items:center;background:#0b2236;border:1px solid var(--cy);border-radius:10px;padding:10px 12px;box-shadow:0 8px 30px #000a;font-size:13px}
#webbar span{flex:1}#webbar button{padding:6px 12px}#webbar .x{padding:6px 9px}
@media(min-width:700px){#webbar{left:50%;right:auto;width:560px;transform:translateX(-50%)}}`;
  document.head.appendChild(st);

  /* ---------- Invitation à installer l'application ---------- */
  const seen = () => { try { return Date.now() - (+localStorage.getItem('bm_inst_dismiss') || 0) < 7 * 864e5; } catch { return false; } };
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferred = e;
    if (!standalone() && !seen()) setTimeout(() => showBar('📲 Installe BioMaint IA sur ton écran d’accueil.', 'Installer', installNow, 'bm_inst_dismiss'), 4000);
  });
  addEventListener('appinstalled', () => { $('#webbar')?.remove(); deferred = null; });
  async function installNow() { if (!deferred) return; deferred.prompt(); try { await deferred.userChoice; } catch { } deferred = null; $('#webbar')?.remove(); }
  if (isIOS && !standalone() && !seen()) setTimeout(() => showBar('📲 Pour installer : touche Partager (carré avec flèche) puis « Sur l’écran d’accueil ».', null, null, 'bm_inst_dismiss'), 5000);

  /* ---------- Notifications (quand l'application est ouverte) ---------- */
  api.native = async (title, text) => {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const opt = { body: text, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'bm-' + Date.now() };
      const reg = await navigator.serviceWorker?.getRegistration();
      reg ? reg.showNotification(title, opt) : new Notification(title, opt);
    } catch { }
  };

  /* ---------- Mises à jour : vérification du service worker ---------- */
  api.checkUpdate = async () => {
    const a = await api.about(), reg = await navigator.serviceWorker?.getRegistration();
    if (!reg) throw new Error('Mode hors installation : ouvrez le site en HTTPS pour activer les mises à jour.');
    await reg.update(); await new Promise(r => setTimeout(r, 2500));
    return { current: a.version || '', latest: a.version || '', url: '', notes: '', newer: false };
  };

  /* ---------- Section « Application web » dans Réglages ---------- */
  const perm = () => !('Notification' in window) ? 'indisponible' : Notification.permission === 'granted' ? 'activées' : Notification.permission === 'denied' ? 'bloquées' : 'désactivées';
  function injectSection() {
    const main = $('main'); if (!main || $('#web-sec')) return;
    const upd = [...main.querySelectorAll('section h3')].find(h => /Mises à jour/.test(h.textContent))?.closest('section'); if (!upd) return;
    const s = document.createElement('section'); s.id = 'web-sec';
    s.innerHTML = `<h3>Application web</h3>
<p>${standalone() ? '<span class="tag ok">Installée</span>' : '<span class="tag wa">Dans le navigateur</span>'} <span class="tag ${navigator.onLine ? 'ok' : 'wa'}">${navigator.onLine ? 'En ligne' : 'Hors ligne'}</span> <span class="tag">Notifications ${perm()}</span></p>
<p class="mu">Les rappels de maintenance s’affichent quand l’application est ouverte (la version web ne peut pas réveiller le téléphone en arrière-plan). Les données restent sur cet appareil : pense à la sauvegarde.</p>
<div class="btns">${!standalone() && deferred ? '<button class="ghost" data-web="install">Installer l’application</button>' : ''}${'Notification' in window && Notification.permission !== 'granted' ? '<button data-web="notif">Activer les notifications</button>' : ''}</div>
${isIOS && !standalone() ? '<p class="mu">iPhone : Partager › Sur l’écran d’accueil. Les notifications ne sont possibles qu’une fois l’application installée (iOS 16.4 ou plus).</p>' : ''}`;
    upd.before(s);
  }
  new MutationObserver(injectSection).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-web]'); if (!b) return;
    if (b.dataset.web === 'install') installNow();
    if (b.dataset.web === 'notif') { try { await Notification.requestPermission(); } catch { } $('#web-sec')?.remove(); injectSection(); }
  });
})();
