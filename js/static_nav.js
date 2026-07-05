(function () {
  window.toggleMobileMenu = function (event) {
    if (event) event.preventDefault();

    var navLinks = document.querySelector('.nav-links');
    var toggleBtn = document.querySelector('.nav-mobile-toggle');
    if (!navLinks || !toggleBtn) return;

    var openIcon = toggleBtn.querySelector('.menu-icon-open');
    var closeIcon = toggleBtn.querySelector('.menu-icon-close');
    var isActive = navLinks.classList.toggle('is-active');

    if (openIcon) openIcon.style.display = isActive ? 'none' : 'block';
    if (closeIcon) closeIcon.style.display = isActive ? 'block' : 'none';
    document.body.style.overflow = isActive ? 'hidden' : '';
  };

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.nav-links a').forEach(function (link) {
      link.addEventListener('click', function () {
        var navLinks = document.querySelector('.nav-links');
        if (navLinks && navLinks.classList.contains('is-active')) {
          window.toggleMobileMenu();
        }
      });
    });
  });
})();
