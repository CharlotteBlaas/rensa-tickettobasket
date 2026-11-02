(function () {
  'use strict';

  if (window.__wbcDirectOrderLoaded) return;
  window.__wbcDirectOrderLoaded = true;

  var initializedLinks = new WeakSet();

  function init() {
    var root = document.getElementById('wbc-direct-order');
    if (!root) return false;

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
      return false;
    }

    if (initializedLinks.has(link)) return true;
    initializedLinks.add(link);

    root.setAttribute('data-wbc-initialized', 'true');

    var busy = false;
    var enhanced = true;
    var basketTotal = null;

    input.max = String(max);

    var buttonLabel =
      root.getAttribute('data-button-label') ||
      'Toevoegen aan winkelmand';

    function showStatus(state, message) {
      status.hidden = false;
      status.setAttribute('data-state', state);
      status.textContent = message;
    }

    function fallback(message) {
      enhanced = false;
      wrap.hidden = true;
      input.disabled = true;

      link.removeAttribute('aria-disabled');
      link.textContent = 'Ga naar de productpagina';

      note.textContent =
        'Via de productpagina kun je je winkelmand bekijken en verdergaan.';

      showStatus('error', message);
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

          if (
            Number.isInteger(total) &&
            total >= 0 &&
            basket.numberOfItemsInBasketSubject
          ) {
            basket.numberOfItemsInBasketSubject.next(total);
          }

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
          window.matchMedia(
            '(prefers-reduced-motion: reduce)'
          ).matches
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
          'position:fixed;pointer-events:none;' +
          'z-index:2147483647;width:80px;height:80px;' +
          'object-fit:contain;border-radius:12px;' +
          'background:#b41421;color:white;display:flex;' +
          'align-items:center;justify-content:center;' +
          'font:bold 25px Arial;box-shadow:0 4px 16px #0003;';

        flying.style.left =
          (start.left + start.width / 2 - 40) + 'px';

        flying.style.top =
          (start.top + start.height / 2 - 40) + 'px';

        document.body.appendChild(flying);

        if (typeof flying.animate !== 'function') {
          flying.remove();
          return;
        }

        var flight = flying.animate(
          [
            {
              transform: 'translate(0,0) scale(1)',
              opacity: 0.85
            },
            {
              transform:
                'translate(' +
                (
                  end.left + end.width / 2 -
                  start.left - start.width / 2
                ) +
                'px,' +
                (
                  end.top + end.height / 2 -
                  start.top - start.height / 2
                ) +
                'px) scale(0.2)',
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
        console.warn('Winkelmandanimatie overgeslagen.', error);
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
        'De beveiligingscookie ontbreekt. Log opnieuw in.'
      );
    }

    async function request(url, options) {
      var settings = Object.assign({}, options || {});
      var method = (settings.method || 'GET').toUpperCase();
      var timeoutMs = settings.timeoutMs || 15000;

      delete settings.timeoutMs;

      if (
        new URL(url, location.origin).origin !== location.origin
      ) {
        throw new Error('Onverwachte website voor het verzoek.');
      }

      if (method !== 'GET' && method !== 'HEAD') {
        settings.headers = Object.assign(
          {},
          settings.headers || {},
          { 'X-XSRF-TOKEN': xsrfToken() }
        );
      }

      var controller = new AbortController();

      var timeout = setTimeout(function () {
        controller.abort();
      }, timeoutMs);

      try {
        var response = await fetch(
          url,
          Object.assign(
            {
              credentials: 'same-origin',
              cache: 'no-store',
              signal: controller.signal,
              headers: {
                'Accept': 'application/json'
              }
            },
            settings
          )
        );

        if (response.redirected) {
          throw new Error('Controleer of je nog bent ingelogd.');
        }

        if (!response.ok) {
          throw new Error(
            'De webshop antwoordde met HTTP ' +
            response.status +
            '.'
          );
        }

        // Een lege succesvolle response is toegestaan.
        return await response.text();
      } finally {
        clearTimeout(timeout);
      }
    }

    async function getQuantity() {
      var readDeadline = Date.now() + 2000;

      var url =
        '/odata/BasketItems/' +
        '?$select=productId,articleId,quantity&$top=100';

      var total = 0;
      var selected = 0;
      var pages = 0;

      while (url) {
        if (++pages > 100) {
          throw new Error(
            'De winkelmand kon niet volledig worden gecontroleerd.'
          );
        }

        var remaining = readDeadline - Date.now();

        if (remaining <= 0) {
          throw new Error('De controle duurde te lang.');
        }

        var data = JSON.parse(
          await request(url, {
            timeoutMs: remaining
          })
        );

        if (!Array.isArray(data.value)) {
          throw new Error(
            'Onverwacht antwoord van de winkelmand.'
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
            throw new Error('Onverwachte vervolgpagina.');
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

      if (busy || !input.reportValidity()) return;

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

      var writeStarted = false;
      var slowTimer = null;

      try {
        showStatus('pending', 'Je kaarten toevoegen…');

        var before = await getQuantity();

        // Niet alsnog toevoegen als de klant al is weggegaan.
        if (!root.isConnected) return;

        var previousTotal = basketTotal;

        xsrfToken();

        writeStarted = true;

        slowTimer = setTimeout(function () {
          showStatus(
            'pending',
            'Je toevoeging wordt verwerkt. Even geduld…'
          );
        }, 2000);

        // Dit endpoint verwacht het nieuwe totale productaantal.
        await request(
          '/api/Basket/UpdateQuantityOfProductInBasket/',
          {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              productId: productId,
              articleId: articleId,
              quantity: before + amount
            })
          }
        );

        clearTimeout(slowTimer);

        basketTotal = previousTotal + amount;

        refreshBasket(basketTotal);

        if (root.isConnected) {
          animateBasket(amount);
        }

        showStatus('success', 'Toegevoegd aan winkelmand.');
      } catch (error) {
        clearTimeout(slowTimer);

        console.error(
          'Webcentives direct toevoegen:',
          error
        );

        if (!writeStarted) {
          fallback(
            'Je gaat naar de productpagina om je kaarten te bestellen.'
          );

          if (root.isConnected) {
            window.location.assign(link.href);
          }
        } else {
          // Geen automatische herhaling:
          // de server kan de wijziging al hebben verwerkt.
          refreshBasket();

          fallback(
            'De toevoeging kon niet worden bevestigd. ' +
            'Controleer eerst je winkelmand voordat je opnieuw kaarten toevoegt.'
          );

          var basketLink = root.querySelector(
            '.nbre-basket-link'
          );

          if (basketLink) {
            basketLink.style.display = 'block';
          }
        }
      } finally {
        clearTimeout(slowTimer);

        busy = false;
        link.removeAttribute('aria-disabled');

        if (enhanced) {
          input.disabled = false;
        }
      }
    });

    input.disabled = false;
    wrap.hidden = false;
    link.textContent = buttonLabel;

    note.textContent =
      'Het gekozen aantal wordt aan je winkelmand toegevoegd.';

    return true;
  }

  // Blijf nieuwe content herkennen bij intern navigeren.
  var scanTimer = null;

  function scheduleInit() {
    if (scanTimer !== null) return;

    scanTimer = setTimeout(function () {
      scanTimer = null;
      init();
    }, 50);
  }

  var observer = new MutationObserver(scheduleInit);

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      'id',
      'href',
      'data-product-id',
      'data-article-id',
      'data-max-quantity',
      'data-allowed-origin',
      'data-wbc-order',
      'data-wbc-quantity',
      'data-wbc-quantity-wrap',
      'data-wbc-status',
      'data-wbc-note'
    ]
  });

  window.addEventListener('pageshow', scheduleInit);
  window.addEventListener('popstate', scheduleInit);
  window.addEventListener('hashchange', scheduleInit);

  init();
})();
