// assets/js/mobile-boot.js — minimal shim
(function () {
  const boot = () => window.MobileUI && typeof MobileUI.mountFeed === 'function' && MobileUI.mountFeed();
  document.addEventListener('DOMContentLoaded', boot);
  window.addEventListener('pv:data', boot);
  window.addEventListener('resize', boot);
})();
