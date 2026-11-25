
(() => {
  'use strict';
  let deferredInstall = null;
  const installBtn = document.getElementById('btnInstall');

  const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const canRegisterSW = () => 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');

  if (canRegisterSW()) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}), { once: true });
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e;
    if (installBtn && !isStandalone()) installBtn.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    if (installBtn) installBtn.hidden = true;
  });

  installBtn?.addEventListener('click', async () => {
    if (isStandalone()) { installBtn.hidden = true; return; }
    if (deferredInstall) {
      deferredInstall.prompt();
      try { await deferredInstall.userChoice; } catch {}
      deferredInstall = null;
      return;
    }
    const isApple = /Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isFile = location.protocol === 'file:';
    let message;
    if (isFile) {
      message = 'Este archivo ya se puede usar directamente en este dispositivo. Para instalarlo como una app, publícalo en un sitio HTTPS junto con manifest.webmanifest y service-worker.js.';
    } else if (isApple) {
      message = 'En Safari: abre el menú Compartir y elige “Añadir al Dock” o “Añadir a pantalla de inicio”, según tu dispositivo.';
    } else {
      message = 'En Chrome o Edge: abre el menú del navegador y elige “Instalar Ruta Académica” o “Instalar aplicación”.';
    }
    alert(message);
  });

  // Improve keyboard/mobile viewport behavior without changing stored academic data.
  const setViewportVars = () => {
    const vv = window.visualViewport;
    const h = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty('--visible-height', `${Math.max(320, Math.round(h))}px`);
  };
  setViewportVars();
  window.visualViewport?.addEventListener('resize', setViewportVars);
  window.addEventListener('orientationchange', () => setTimeout(setViewportVars, 120));

  // Close the drawer after changing from mobile to desktop, avoiding a stuck backdrop.
  const desktop = window.matchMedia('(min-width: 901px)');
  const syncDrawer = () => { if (desktop.matches) document.body.classList.remove('menu-open'); };
  desktop.addEventListener?.('change', syncDrawer);
 const menuButton = document.getElementById('menuBtn');
 const syncMenu = () => {
    const open = document.body.classList.contains('menu-open');
    menuButton.setAttribute('aria-expanded', String(open));
    document.getElementById('sidebar').inert = !desktop.matches && !open;
  };
  new MutationObserver(syncMenu).observe(document.body, { attributes:true, attributeFilter:['class'] });
  desktop.addEventListener?.('change', syncMenu);
  syncMenu();
})();
