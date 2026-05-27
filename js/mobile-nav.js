(function () {
  const mobileQuery = window.matchMedia('(max-width: 860px)');
  const headers = document.querySelectorAll('.site-header');

  headers.forEach((header, index) => {
    const toggle = header.querySelector('.nav-toggle');
    const nav = header.querySelector('.site-nav');

    if (!toggle || !nav) {
      return;
    }

    if (!nav.id) {
      nav.id = 'site-nav-menu-' + (index + 1);
    }

    toggle.setAttribute('aria-controls', nav.id);

    const closeMenu = function () {
      header.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open navigation menu');
    };

    const openMenu = function () {
      header.classList.add('nav-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close navigation menu');
    };

    toggle.addEventListener('click', function () {
      if (header.classList.contains('nav-open')) {
        closeMenu();
        return;
      }

      openMenu();
    });

    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        if (mobileQuery.matches) {
          closeMenu();
        }
      });
    });

    document.addEventListener('click', function (event) {
      if (!mobileQuery.matches || !header.classList.contains('nav-open')) {
        return;
      }

      if (!header.contains(event.target)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeMenu();
      }
    });

    const syncState = function () {
      if (!mobileQuery.matches) {
        closeMenu();
      }
    };

    if (typeof mobileQuery.addEventListener === 'function') {
      mobileQuery.addEventListener('change', syncState);
    } else if (typeof mobileQuery.addListener === 'function') {
      mobileQuery.addListener(syncState);
    }

    closeMenu();
  });
})();