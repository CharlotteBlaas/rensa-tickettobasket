(function () {
  'use strict';

  if (window.__wbcDirectOrderLoaded) return;
  window.__wbcDirectOrderLoaded = true;

  function init() {
    var root = document.getElementById('wbc-direct-order');

    if (!root) return false;
    if (root.getAttribute('data-wbc-initialized')) return true;

    var link = root.querySelector('[data-wbc-order]');
    var input = root.querySelector('[data-wbc-quantity]');
    var wrap = root.querySelector('[data-wbc-quantity-wrap]');
    var status = root.querySelector('[data-wbc-status]');
    var note = root.querySelector('[data-wbc-note]');

    var productId = Number(root.getAttribute('data-product-id'));
    var articleId = Number(root.getAttribute('data-article-id'));
    var max = Number(root.getAttribute('data-max-quantity'));
    var origin = root.getAttribute('data-allowed-origin');

    if (
      !link || !input || !wrap || !status || !note ||
      !window.fetch || !window.AbortController ||
      !Number.isInteger(productId) || productId < 1 ||
      !Number.isInteger(articleId) || articleId < 1 ||
      !Number.isInteger(max) || max < 1 ||
      location.origin !== origin ||
      new URL(link.href).origin !== origin
    ) {
      return true;
    }

    root.setAttribute('data-wbc-initialized', 'true');

    var busy = false;
    var enhanced = true;
    var basketTotal = null;

    input.max = String(max);

    function fallback(message) {
      enhanced = false;
      wrap.hidden = true;
      input.disabled = true;

      link.removeAttribute('aria-disabled');
      link.textContent = 'Ga naar de productpagina';

      note.textContent = 'Via de productpagina kun je verdergaan.';
      status.textContent = message;
    }

    function refreshBasket(total) {
      try {
        if (!window.angular) return false;

        var nodes = [
          root,
          document.body,
          document.documentElement,
          document
        ];

        var apps = document.querySelectorAll(
          '[ng-app],[data-ng-app],[ng-controller],[data-ng-controller]'
        );

        for (var i = 0; i < apps.length; i++) {
          nodes.push(apps[i]);
        }

        for (var j = 0; j < nodes.length; j++) {
          var injector = window.angular.element(nodes[j]).injector();

          if (
            !injector ||
            !injector.has('ngBasketStateService')
          ) {
            continue;
          }

          var basket = injector.get('ngBasketStateService');

          if (
            !basket ||
            typeof basket.initializeBasket !== 'function'
          ) {
            continue;
          }

          var scope = injector.get('$rootScope');

          // Direct het door de server bevestigde totaal tonen.
          if (
            Number.isInteger(total) &&
            total >= 0 &&
            basket.numberOfItemsInBasketSubject
          ) {
            basket.numberOfItemsInBasketSubject.next(total);
          }

          // Volledige winkelmand op de achtergrond verversen.
          scope.$evalAsync(function () {
            basket.initializeBasket();
          });

          return true;
        }
      } catch (error) {
        console.warn(
          'Winkelmandweergave kon niet worden vernieuwd.',
          error
        );
      }

      return false;
    }

    function animateBasket(amount) {
      try {
        if (
          window.matchMedia &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
          return;
        }

        var targets = document.querySelectorAll(
          '.desktop-menu-container-sticky .basket-outer,' +
          '.basket-animation-goal-mobile,' +
          '.basket-animation-goal,' +
          '.basket-click'
        );

        var target = null;

        for (var i = 0; i < targets.length; i++) {
          var rect = targets[i].getBoundingClientRect();

          if (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.top < window.innerHeight &&
            rect.right > 0 &&
            rect.left < window.innerWidth
          ) {
            target = targets[i];
            break;
          }
        }

        if (!target) return;

        var source = root.querySelector(
          '.wbc-media img,.nbre-product__media img'
        );

        var start = (source || link).getBoundingClientRect();
        var end = target.getBoundingClientRect();

        // Zonder productafbeelding gebruiken we een +aantal-badge.
        var flying = document.createElement(
          source ? 'img' : 'div'
        );

        if (source) {
          flying.src = source.currentSrc || source.src;
          flying.alt = '';
        } else {
          flying.textContent = '+' + amount;
        }

        flying.setAttribute('aria-hidden', 'true');

        flying.style.cssText =
          'position:fixed;' +
          'pointer-events:none;' +
          'z-index:2147483647;' +
          'width:80px;height:80px;' +
          'object-fit:contain;' +
          'border-radius:12px;' +
          'background:#b41421;color:white;' +
          'display:flex;align-items:center;justify-content:center;' +
          'font:bold 25px Arial;' +
          'box-shadow:0 4px 16px #0003;';

        flying.style.left =
          (start.left + start.width / 2 - 40) + 'px';

        flying.style.top =
          (start.top + start.height / 2 - 40) + 'px';

        document.body.appendChild(flying);

        if (typeof flying.animate !== 'function') {
          flying.remove();
          return;
        }

        var deltaX =
          end.left + end.width / 2 -
          start.left - start.width / 2;

        var deltaY =
          end.top + end.height / 2 -
          start.top - start.height / 2;

        var flight = flying.animate(
          [
            {
              transform: 'translate(0,0) scale(1)',
              opacity: 0.85
            },
            {
              transform:
                'translate(' + deltaX + 'px,' +
                deltaY + 'px) scale(0.2)',
              opacity: 0.2
            }
          ],
          {
            duration: 650,
            easing: 'ease-in-out',
            fill: 'forwards'
          }
        );

        var cleanup = function () {
          flying.remove();
        };

        flight.onfinish = cleanup;
        flight.oncancel = cleanup;

        setTimeout(cleanup, 1100);
      } catch (error) {
        console.warn(
          'Winkelmandanimatie overgeslagen.',
          error
        );
      }
    }

    function xsrfToken() {
      var entries = document.cookie.split(';');

      for (var i = 0; i < entries.length; i++) {
        var cookie = entries[i].trim();
        var separator = cookie.indexOf('=');

        if (
          separator !== -1 &&
          cookie.slice(0, separator) === 'XSRF-Token'
        ) {
          var value = decodeURIComponent(
            cookie.slice(separator + 1)
          );

          if (value) return value;
        }
      }

      throw new Error(
        'De beveiligingscookie XSRF-Token is niet beschikbaar. Log opnieuw in.'
      );
    }

    async function request(url, options) {
      var settings = Object.assign({}, options || {});
      var method = (settings.method || 'GET').toUpperCase();

      if (
        new URL(url, location.origin).origin !== location.origin
      ) {
        throw new Error(
          'Een verzoek naar een andere website is niet toegestaan.'
        );
      }

      if (method !== 'GET' && method !== 'HEAD') {
        settings.headers = Object.assign(
          {},
          settings.headers || {},
          {
            'X-XSRF-TOKEN': xsrfToken()
          }
        );
      }

      var controller = new AbortController();

      var timeout = setTimeout(function () {
        controller.abort();
      }, 20000);

      try {
        var response = await fetch(
          url,
          Object.assign(
            {
              credentials: 'same-origin',
              cache: 'no-store',
              signal: controller.signal,
              headers: {
                Accept: 'application/json'
              }
            },
            settings
          )
        );

        if (response.redirected) {
          throw new Error(
            'Controleer of je nog bent ingelogd.'
          );
        }

        if (!response.ok) {
          throw new Error(
            'De webshop antwoordde met HTTP ' +
            response.status + '.'
          );
        }

        return await response.text();
      } finally {
        clearTimeout(timeout);
      }
    }

    async function getQuantity() {
      // Alle aantallen ophalen, ook van eventuele andere producten.
      var url =
        '/odata/BasketItems/' +
        '?$select=productId,articleId,quantity&$top=100';

      var total = 0;
      var selected = 0;
      var pages = 0;

      while (url) {
        if (++pages > 100) {
          throw new Error(
            'De winkelmand is te groot om volledig te controleren.'
          );
        }

        var data = JSON.parse(await request(url));

        if (!Array.isArray(data.value)) {
          throw new Error(
            'De winkelmand kon niet worden gecontroleerd.'
          );
        }

        data.value.forEach(function (item) {
          if (
            !Number.isInteger(item.quantity) ||
            item.quantity < 0
          ) {
            throw new Error(
              'Onverwacht aantal in de winkelmand.'
            );
          }

          total += item.quantity;

          if (
            item.productId === productId &&
            item.articleId === articleId
          ) {
            selected += item.quantity;
          }
        });

        url = data['@odata.nextLink'] || null;

        if (url) {
          var next = new URL(url, location.origin);

          if (
            next.origin !== location.origin ||
            next.pathname.indexOf('/odata/BasketItems') !== 0
          ) {
            throw new Error(
              'Onverwachte vervolgpagina van de winkelmand.'
            );
          }

          url = next.href;
        }
      }

      basketTotal = total;
      return selected;
    }

    link.addEventListener('click', async function (event) {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.button > 0
      ) {
        return;
      }

      if (!enhanced) return;

      event.preventDefault();

      if (busy) return;
      if (!input.reportValidity()) return;

      var amount = Number(input.value);

      if (
        !Number.isInteger(amount) ||
        amount < 1 ||
        amount > max
      ) {
        return;
      }

      busy = true;
      input.disabled = true;
      link.setAttribute('aria-disabled', 'true');

      var attempted = false;
      var confirmed = 0;

      try {
        status.textContent = 'Je winkelmand controleren…';

        var before = await getQuantity();

        for (var i = 0; i < amount; i++) {
          status.textContent =
            'Voucher ' + (i + 1) +
            ' van ' + amount + ' toevoegen…';

          xsrfToken();
          attempted = true;

          await request('/api/Basket/AddProductInBasket/', {
            method: 'POST',

            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },

            body: JSON.stringify({
              productId: productId,
              articleId: articleId
            })
          });

          var after = await getQuantity();

          if (after !== before + 1) {
            throw new Error(
              'De verwachte verhoging kon niet worden bevestigd.'
            );
          }

          confirmed++;
          before = after;
        }

        var refreshed = refreshBasket(basketTotal);

        animateBasket(confirmed);

        enhanced = false;
        input.disabled = true;
        wrap.hidden = true;

        link.removeAttribute('aria-disabled');
        link.textContent = 'Ga naar de productpagina';

        note.textContent =
          'Je vouchers zijn toegevoegd. ' +
          'Rond je bestelling af via de winkelmand.';

        status.textContent =
          'Gelukt: ' + confirmed +
          ' voucher(s) toegevoegd. Er staan nu ' +
          before + ' van dit product in je winkelmand.' +
          (
            refreshed
              ? ''
              : ' Vernieuw de pagina om ook de winkelmandweergave bij te werken.'
          );
      } catch (error) {
        console.error(
          'Webcentives direct toevoegen:',
          error
        );

        if (attempted) {
          refreshBasket();
        }

        if (!attempted) {
          fallback(
            'Direct toevoegen is niet beschikbaar. ' +
            'Je gaat naar de productpagina.'
          );

          window.location.assign(link.href);
        } else {
          fallback(
            'Toevoegen gestopt. ' + confirmed +
            ' toevoeging(en) bevestigd. ' +
            'Het laatste verzoek kan al verwerkt zijn. ' +
            'Controleer eerst je winkelmand voordat je meer toevoegt. ' +
            'Via de knop kun je naar de productpagina.'
          );
        }
      } finally {
        busy = false;
        link.removeAttribute('aria-disabled');
      }
    });

    input.disabled = false;
    wrap.hidden = false;

    link.textContent = 'Toevoegen aan winkelmand';

    note.textContent =
      'Het gekozen aantal wordt aan je bestaande winkelmand toegevoegd.';

    return true;
  }

  if (!init()) {
    var observer = new MutationObserver(function () {
      if (init()) {
        observer.disconnect();
        clearTimeout(timer);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    var timer = setTimeout(function () {
      observer.disconnect();
    }, 15000);
  }
})();
