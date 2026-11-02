(function () {
  'use strict';

  if (window.__wbcDirectOrderLoaded) {
    return;
  }

  window.__wbcDirectOrderLoaded = true;

  function init() {
    var root = document.getElementById('wbc-direct-order');

    if (!root) {
      return false;
    }

    if (root.getAttribute('data-wbc-initialized')) {
      return true;
    }

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

    async function request(url, options) {
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
            options || {}
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

        // Een lege response bij een geslaagde POST is toegestaan.
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
      // Ctrl/Cmd-klik en openen in een nieuw tabblad blijven werken.
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.button > 0
      ) {
        return;
      }

      // Na succes of een fout werkt de knop weer als gewone link.
      if (!enhanced) {
        return;
      }

      event.preventDefault();

      if (busy) {
        return;
      }

      if (!input.reportValidity()) {
        return;
      }

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

        // De bestaande koppeling krijgt één toevoeging per verzoek.
        for (var i = 0; i < amount; i++) {
          status.textContent =
            'Voucher ' +
            (i + 1) +
            ' van ' +
            amount +
            ' toevoegen…';

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
          // Nog geen POST verstuurd: veilig naar de productpagina.
          fallback(
            'Direct toevoegen is niet beschikbaar. ' +
              'Je gaat naar de productpagina.'
          );

          window.location.assign(link.href);
        } else {
          // Een mislukt of verlopen verzoek kan al verwerkt zijn.
          // Daarom geen automatische herhaling of doorverwijzing.
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

    // Pas na het instellen van de klikafhandeling tonen we het aantal.
    input.disabled = false;
    wrap.hidden = false;

    link.textContent = 'Toevoegen aan winkelmand';

    note.textContent =
      'Het gekozen aantal wordt aan je bestaande winkelmand toegevoegd.';

    return true;
  }

  // Ondersteunt content die na DOM Ready wordt ingevoegd.
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
