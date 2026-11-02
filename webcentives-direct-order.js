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
      !link ||
      !input ||
      !wrap ||
      !status ||
      !note ||
      !window.fetch ||
      !window.AbortController ||
      !Number.isInteger(productId) ||
      productId < 1 ||
      !Number.isInteger(articleId) ||
      articleId < 1 ||
      !Number.isInteger(max) ||
      max < 1 ||
      location.origin !== origin ||
      new URL(link.href).origin !== origin
    ) {
      return true;
    }

    root.setAttribute('data-wbc-initialized', 'true');

    var busy = false;
    var enhanced = true;

    input.max = String(max);

    function fallback(message) {
      enhanced = false;
      wrap.hidden = true;
      input.disabled = true;

      link.removeAttribute('aria-disabled');
      link.textContent = 'Ga naar de productpagina';

      note.textContent =
        'Via de productpagina kun je verdergaan.';

      status.textContent = message;
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
              response.status +
              '.'
          );
        }

        return await response.text();
      } finally {
        clearTimeout(timeout);
      }
    }

    async function getQuantity() {
      var filter =
        'productId eq ' +
        productId +
        ' and articleId eq ' +
        articleId;

      var url =
        '/odata/BasketItems/?$filter=' +
        encodeURIComponent(filter) +
        '&$select=productId,articleId,quantity&$top=100';

      var data = JSON.parse(await request(url));

      if (
        !Array.isArray(data.value) ||
        data['@odata.nextLink']
      ) {
        throw new Error(
          'De winkelmand kon niet volledig worden gecontroleerd.'
        );
      }

      return data.value.reduce(function (sum, item) {
        if (
          item.productId !== productId ||
          item.articleId !== articleId
        ) {
          return sum;
        }

        if (
          !Number.isInteger(item.quantity) ||
          item.quantity < 0
        ) {
          throw new Error(
            'Onverwacht aantal in de winkelmand.'
          );
        }

        return sum + item.quantity;
      }, 0);
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
            'Voucher ' +
            (i + 1) +
            ' van ' +
            amount +
            ' toevoegen…';

          // Controleer de cookie voordat een toevoeging wordt gestart.
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

        fallback(
          'Gelukt: ' +
            confirmed +
            ' voucher(s) toegevoegd. Er staan nu ' +
            before +
            ' van dit product in je winkelmand. ' +
            'Open je winkelmand via het icoon bovenaan. ' +
            'Vernieuw zo nodig de pagina om het icoon bij te werken.'
        );
      } catch (error) {
        console.error(
          'Webcentives direct toevoegen:',
          error
        );

        if (!attempted) {
          fallback(
            'Direct toevoegen is niet beschikbaar. ' +
              'Je gaat naar de productpagina.'
          );

          window.location.assign(link.href);
        } else {
          fallback(
            'Toevoegen gestopt. ' +
              confirmed +
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
