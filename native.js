'use strict';

const DexNative = (() => {
  const root = document.documentElement;
  const dialog = document.getElementById('detail');
  const menu = document.getElementById('app-menu');
  const menuButton = document.getElementById('menu-open');
  let menuNavigating = false;
  const closeMenu = () => { if (menu.open) menu.close(); };
  menuButton.addEventListener('click', () => {
    if (dialog.open) return;
    menuNavigating = false;
    menu.showModal();
    menuButton.setAttribute('aria-expanded', 'true');
    document.body.classList.add('menu-visible');
    if (!reduced()) menu.animate([{transform: 'translateX(-100%)'}, {transform: 'translateX(0)'}], {duration: 200, easing: 'ease-out'});
  });
  document.getElementById('menu-close').addEventListener('click', closeMenu);
  menu.addEventListener('close', () => { menuButton.setAttribute('aria-expanded', 'false'); document.body.classList.remove('menu-visible'); if (!menuNavigating) menuButton.focus({preventScroll: true}); });
  menu.addEventListener('click', event => {
    const target = event.target.closest('a, [data-menu-view]');
    if (target) { menuNavigating = true; closeMenu(); if (target.dataset.menuView) location.hash = target.dataset.menuView; return; }
    const bounds = menu.getBoundingClientRect();
    if (event.target === menu && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) closeMenu();
  });
  addEventListener('hashchange', closeMenu);
  const bridge = document.querySelector('.haptic-bridge');
  const springSupported = CSS.supports('transition-timing-function', 'linear(0, 1)');
  const SPRING = springSupported ? 'linear(0, .0154, .0555 3.1%, .2072 6.5%, .4289 10.6%, .6311 15%, .7832 19.7%, .8836 24.6%, .9468 30.2%, .9795 36%, .9948 42.7%, 1.0014 51.4%, 1.0021 63.6%, 1)' : 'cubic-bezier(.2, .9, .25, 1)';
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const reduced = () => document.body.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stored = key => { try { return localStorage.getItem('dex.' + key); } catch { return null; } };
  const store = (key, value) => { try { localStorage.setItem('dex.' + key, value); } catch {} };
  const systemTheme = matchMedia('(prefers-color-scheme: dark)');
  const themeSetting = document.getElementById('theme-setting');
  let theme = ['light', 'dark', 'system'].includes(stored('theme')) ? stored('theme') : 'system';
  function applyTheme() {
    const dark = theme === 'dark' || (theme === 'system' && systemTheme.matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]').content = dark ? '#000000' : '#f7f8fa';
    document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').content = dark ? 'black' : 'default';
    document.dispatchEvent(new Event('dex-theme-change'));
  }
  themeSetting.value = theme;
  themeSetting.addEventListener('change', () => {
    theme = themeSetting.value;
    store('theme', theme);
    applyTheme();
  });
  systemTheme.addEventListener('change', applyTheme);
  applyTheme();

  // iOS 18 Safari fires a system haptic when a switch input toggles; other platforms use the Vibration API.
  function haptic(kind = 'selection') {
    if (typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(kind === 'impact' ? 12 : kind === 'success' ? [8, 50, 12] : 6); } catch {}
    } else if (ios && bridge) bridge.click();
  }
  document.addEventListener('touchstart', () => {}, {passive: true});
  document.addEventListener('click', event => {
    if (event.target.closest('.haptic-bridge')) return;
    if (event.target.closest('.navigation a, .segmented button, .filter, .allocation-item, .allocation-toggle, input.switch, .chip-button')) haptic();
  });

  function transition(update) {
    const before = document.querySelector('.view:not([hidden])');
    update();
    const after = document.querySelector('.view:not([hidden])');
    if (reduced() || !after || after === before) return;
    after.animate([{opacity: 0, transform: 'translateY(10px)'}, {opacity: 1, transform: 'none'}], {duration: 320, easing: 'cubic-bezier(.22, 1, .36, 1)'});
  }

  // Wallet-style flight: the tapped card rises into the sheet header on a layer above the sheet.
  function flyCard(source, target) {
    if (reduced() || !source || !target || typeof HTMLElement.prototype.showPopover !== 'function') return;
    const from = source.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    if (!from.width || !to.width) return;
    const layer = document.createElement('div');
    layer.popover = 'manual';
    layer.className = 'card-flight wallet';
    const clone = source.cloneNode(true);
    clone.removeAttribute('data-account');
    clone.setAttribute('aria-hidden', 'true');
    clone.tabIndex = -1;
    layer.append(clone);
    document.body.append(layer);
    clone.style.left = from.left + 'px';
    clone.style.top = from.top + 'px';
    clone.style.width = from.width + 'px';
    clone.style.height = from.height + 'px';
    layer.showPopover();
    target.style.visibility = 'hidden';
    source.style.visibility = 'hidden';
    const flight = clone.animate([
      {transform: 'translate(0, 0) scale(1)', boxShadow: '0 -10px 30px rgba(0,0,0,.55)'},
      {transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`, boxShadow: '0 18px 40px rgba(0,0,0,.45)'}
    ], {duration: 560, easing: SPRING, fill: 'forwards'});
    const land = () => { target.style.visibility = ''; source.style.visibility = ''; layer.remove(); };
    flight.finished.then(land, land);
  }

  // Sheet presentation and interactive dismissal.
  let sheetAnimation = null;
  function presentSheet() {
    if (reduced()) return;
    sheetAnimation?.cancel();
    sheetAnimation = dialog.animate([{transform: 'translateY(100%)'}, {transform: 'translateY(0)'}], {duration: 560, easing: SPRING});
  }
  function dismissSheet(done) {
    sheetAnimation?.cancel();
    if (reduced()) { dialog.style.transform = ''; done(); return; }
    const offset = new DOMMatrixReadOnly(getComputedStyle(dialog).transform).m42 || 0;
    dialog.classList.add('closing');
    const animation = dialog.animate([{transform: `translateY(${offset}px)`}, {transform: 'translateY(100%)'}],
      {duration: Math.max(180, 300 - offset), easing: 'cubic-bezier(.32, 0, .67, 0)', fill: 'forwards'});
    const finish = () => { dialog.style.transform = ''; done(); animation.cancel(); dialog.classList.remove('closing'); };
    animation.finished.then(finish, finish);
  }
  let drag = null;
  function dragStart(y, handle) {
    if (!dialog.open || dialog.classList.contains('closing')) return;
    drag = {origin: y, last: y, time: performance.now(), velocity: 0, offset: 0, active: handle};
  }
  function dragMove(y, event) {
    if (!drag) return;
    const delta = y - drag.origin;
    if (!drag.active) {
      if (delta > 6 && dialog.scrollTop <= 0) { drag.active = true; drag.origin = y; }
      else if (Math.abs(delta) > 6) { drag = null; return; }
      else return;
    }
    if (event.cancelable) event.preventDefault();
    const now = performance.now();
    drag.velocity = (y - drag.last) / Math.max(1, now - drag.time);
    drag.last = y; drag.time = now;
    const distance = y - drag.origin;
    drag.offset = distance < 0 ? -Math.sqrt(-distance) * 3 : distance;
    sheetAnimation?.cancel();
    dialog.style.transform = `translateY(${drag.offset}px)`;
  }
  function dragEnd() {
    if (!drag) return;
    const {active, offset, velocity} = drag;
    drag = null;
    if (!active) return;
    if ((offset > 110 || velocity > .5) && offset > 0 && closeDetail()) { haptic(); return; }
    dialog.style.transform = '';
    if (!reduced() && offset) sheetAnimation = dialog.animate([{transform: `translateY(${offset}px)`}, {transform: 'translateY(0)'}], {duration: 480, easing: SPRING});
  }
  dialog.addEventListener('touchstart', event => {
    if (event.touches.length === 1) dragStart(event.touches[0].clientY, !!event.target.closest('.sheet-grabber, .sheet-header'));
  }, {passive: true});
  dialog.addEventListener('touchmove', event => dragMove(event.touches[0].clientY, event), {passive: false});
  dialog.addEventListener('touchend', dragEnd);
  dialog.addEventListener('touchcancel', dragEnd);
  dialog.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || !event.target.closest('.sheet-grabber, .sheet-header') || event.target.closest('button')) return;
    dialog.setPointerCapture(event.pointerId);
    dragStart(event.clientY, true);
  });
  dialog.addEventListener('pointermove', event => { if (event.pointerType === 'mouse' && drag) dragMove(event.clientY, event); });
  dialog.addEventListener('pointerup', event => { if (event.pointerType === 'mouse') dragEnd(); });

  // Pull to refresh.
  const main = document.getElementById('main');
  const indicator = document.getElementById('ptr');
  const THRESHOLD = 72;
  let pull = null;
  function canPull(target) {
    return scrollY <= 0 && !dialog.open && !document.body.classList.contains('loading') && document.getElementById('portal-login').hidden &&
      !target.closest('#history-chart, .filter-row, input, select, textarea, .float-bar');
  }
  document.addEventListener('touchstart', event => {
    if (event.touches.length !== 1 || !canPull(event.target)) { pull = null; return; }
    pull = {x: event.touches[0].clientX, y: event.touches[0].clientY, active: false, armed: false, distance: 0};
  }, {passive: true});
  document.addEventListener('touchmove', event => {
    if (!pull) return;
    const dy = event.touches[0].clientY - pull.y;
    const dx = event.touches[0].clientX - pull.x;
    if (!pull.active) {
      if (dy > 8 && dy > Math.abs(dx) && scrollY <= 0) pull.active = true;
      else if (Math.abs(dx) > 8 || dy < -8) { pull = null; return; }
      else return;
    }
    if (event.cancelable) event.preventDefault();
    pull.distance = 150 * (1 - Math.exp(-dy / 260));
    const progress = Math.min(1, pull.distance / THRESHOLD);
    main.classList.add('pulling'); main.classList.remove('releasing');
    main.style.transform = `translateY(${pull.distance}px)`;
    indicator.style.opacity = String(progress);
    indicator.style.transform = `translateY(${pull.distance * .85}px) rotate(${progress * 300}deg) scale(${.6 + progress * .4})`;
    if (!pull.armed && pull.distance >= THRESHOLD) { pull.armed = true; haptic('impact'); }
    else if (pull.armed && pull.distance < THRESHOLD - 8) pull.armed = false;
  }, {passive: false});
  function settle() {
    main.classList.remove('pulling'); main.classList.add('releasing');
    main.style.transform = '';
    indicator.classList.remove('refreshing');
    indicator.style.opacity = '0';
    indicator.style.transform = '';
  }
  function releasePull() {
    if (!pull) return;
    const {active, armed} = pull;
    pull = null;
    if (!active) return;
    if (!armed) { settle(); return; }
    main.classList.remove('pulling'); main.classList.add('releasing');
    main.style.transform = 'translateY(56px)';
    indicator.classList.add('refreshing');
    indicator.style.transform = 'translateY(50px)';
    const started = performance.now();
    const refresh = document.getElementById('refresh');
    refresh.click();
    const wait = () => refresh.classList.contains('spinning') || performance.now() - started < 650 ? setTimeout(wait, 120) : settle();
    setTimeout(wait, 200);
  }
  document.addEventListener('touchend', releasePull);
  document.addEventListener('touchcancel', releasePull);
  main.addEventListener('transitionend', () => main.classList.remove('releasing'));

  // Navigation bar: compact title after the large title scrolls away.
  const topbar = document.querySelector('.topbar');
  const navTitle = document.getElementById('nav-title');
  let scrollFrame = 0;
  function updateBar() {
    scrollFrame = 0;
    const view = document.querySelector('.view:not([hidden])');
    topbar.classList.toggle('scrolled', scrollY > (view?.id === 'resumen' ? 92 : 40));
  }
  addEventListener('scroll', () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(updateBar); }, {passive: true});
  function viewChanged(view) {
    navTitle.textContent = view.dataset.title || '';
    updateBar();
  }
  document.querySelector('.navigation').addEventListener('click', event => {
    const link = event.target.closest('a[aria-current="page"]');
    if (link && location.hash.slice(1) === link.dataset.view) {
      event.preventDefault();
      scrollTo({top: 0, behavior: reduced() ? 'auto' : 'smooth'});
    }
  });

  // Segmented controls: sliding selection thumb.
  function syncSegments() {
    document.querySelectorAll('.segmented:not(.period-chips)').forEach(group => {
      const buttons = [...group.querySelectorAll('button')];
      group.style.setProperty('--count', String(buttons.length));
      group.style.setProperty('--index', String(Math.max(0, buttons.findIndex(button => button.getAttribute('aria-pressed') === 'true'))));
    });
  }
  new MutationObserver(syncSegments).observe(document.body, {subtree: true, attributes: true, attributeFilter: ['aria-pressed']});
  syncSegments();

  // Keyboard-aware sheet.
  const viewport = window.visualViewport;
  function fitKeyboard() {
    const keyboard = Math.max(0, innerHeight - viewport.height - viewport.offsetTop);
    root.style.setProperty('--kb', keyboard > 80 ? keyboard + 'px' : '0px');
    root.classList.toggle('keyboard', keyboard > 80);
  }
  if (viewport) { viewport.addEventListener('resize', fitKeyboard); viewport.addEventListener('scroll', fitKeyboard); }
  document.addEventListener('focusin', event => {
    if (!dialog.contains(event.target) || !event.target.matches('input:not([type=checkbox]), select, textarea')) return;
    setTimeout(() => event.target.scrollIntoView({block: 'center', behavior: reduced() ? 'auto' : 'smooth'}), 320);
  });

  // Install prompt: native prompt where available, instructions on iOS Safari.
  const installGroup = document.getElementById('install-group');
  const installCard = document.getElementById('install-card');
  const installAction = document.getElementById('install-action');
  const updatePrompt = document.getElementById('update-prompt');
  let deferredPrompt = null;
  function offerInstall() {
    if (standalone()) return;
    installGroup.hidden = false;
    if (navigator.webdriver || stored('install-dismissed') === 'true') return;
    let attempts = 0;
    const show = () => {
      if (standalone() || !installGroup.isConnected) return;
      if ((document.body.classList.contains('loading') || dialog.open || !updatePrompt.hidden) && attempts++ < 8) { setTimeout(show, 1500); return; }
      if (document.getElementById('portal-login').hidden) installCard.hidden = false;
    };
    setTimeout(show, 2400);
  }
  function dismissInstall() { installCard.hidden = true; store('install-dismissed', 'true'); }
  async function install() {
    installCard.hidden = true;
    if (!deferredPrompt) { openDetail('install'); return; }
    const prompt = deferredPrompt;
    deferredPrompt = null;
    prompt.prompt();
    try { if ((await prompt.userChoice).outcome === 'accepted') installGroup.hidden = true; } catch {}
  }
  addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    installAction.textContent = I18n.translate('Instalar');
    offerInstall();
  });
  addEventListener('appinstalled', () => { installGroup.hidden = true; installCard.hidden = true; deferredPrompt = null; });
  if (ios && !standalone()) { installAction.textContent = I18n.translate('C\u00f3mo'); offerInstall(); }
  installAction.addEventListener('click', install);
  document.getElementById('install-setting').addEventListener('click', install);
  document.getElementById('install-dismiss').addEventListener('click', dismissInstall);

  // Service worker update flow.
  let waiting = null;
  let applying = false;
  const controlled = !!navigator.serviceWorker?.controller;
  function watch(registration) {
    const show = worker => {
      if (!controlled || !worker || registration.waiting !== worker) return;
      waiting = worker;
      installCard.hidden = true;
      updatePrompt.hidden = false;
    };
    if (registration.waiting) show(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed') show(worker); });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) registration.update().catch(() => {}); });
  }
  document.getElementById('update-apply').addEventListener('click', () => {
    if (!waiting) return;
    applying = true;
    haptic('success');
    updatePrompt.hidden = true;
    waiting.postMessage({type: 'SKIP_WAITING'});
  });
  navigator.serviceWorker?.addEventListener('controllerchange', () => { if (applying) { applying = false; location.reload(); } });

  return {haptic, transition, flyCard, presentSheet, dismissSheet, viewChanged, watch, reduced, ios};
})();
