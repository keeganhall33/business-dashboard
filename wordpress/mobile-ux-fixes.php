<?php
/**
 * KeeganHall mobile UX fixes.
 * Install as a PHP snippet in Code Snippets and run on front end only.
 * Fixes:
 * - Museum Edition / Standard Edition controls side-by-side on mobile.
 * - FunnelKit smart-login button width on mobile.
 * - Adds a visible "Calculating shipping..." state during checkout refresh.
 */

add_action('wp_footer', function () {
    ?>
<style id="kh-mobile-ux-fixes-v1">
@media (max-width: 767px) {
  .kh-edition-toggle-row {
    display: flex !important;
    flex-wrap: nowrap !important;
    align-items: stretch !important;
    gap: 8px !important;
    width: 100% !important;
  }

  .kh-edition-toggle-row > *,
  .kh-edition-choice {
    flex: 1 1 0 !important;
    width: auto !important;
    min-width: 0 !important;
    max-width: none !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
  }

  .kh-edition-choice {
    white-space: nowrap !important;
    text-align: center !important;
    padding-left: 10px !important;
    padding-right: 10px !important;
    font-size: clamp(12px, 3.5vw, 16px) !important;
  }

  .kh-smart-login-button {
    width: auto !important;
    min-width: 104px !important;
    max-width: none !important;
    flex: 0 0 auto !important;
    white-space: nowrap !important;
    word-break: normal !important;
    overflow-wrap: normal !important;
    padding-left: 16px !important;
    padding-right: 16px !important;
  }

  .kh-smart-login-row {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
  }

  .kh-smart-login-row > :not(.kh-smart-login-button) {
    min-width: 0 !important;
    flex: 1 1 auto !important;
  }
}

#kh-shipping-calculating {
  display: none;
  align-items: center;
  gap: 9px;
  margin: 10px 0 8px;
  font-size: 14px;
  line-height: 1.35;
  opacity: .82;
}

#kh-shipping-calculating.kh-visible {
  display: flex;
}

#kh-shipping-calculating::before {
  content: '';
  width: 15px;
  height: 15px;
  flex: 0 0 15px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: kh-shipping-spin .8s linear infinite;
}

@keyframes kh-shipping-spin {
  to { transform: rotate(360deg); }
}
</style>
<script id="kh-mobile-ux-fixes-v1-script">
(function () {
  'use strict';

  function exactText(el, text) {
    return String(el && el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase() === text.toLowerCase();
  }

  function visible(el) {
    if (!el) return false;
    var s = window.getComputedStyle(el);
    var r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  }

  function findControlByText(text) {
    var nodes = document.querySelectorAll('button, a, label, [role="button"], .button, .variable-item, .swatch, li');
    for (var i = 0; i < nodes.length; i++) {
      if (exactText(nodes[i], text) && visible(nodes[i])) return nodes[i];
    }
    return null;
  }

  function commonAncestor(a, b) {
    if (!a || !b) return null;
    var p = a;
    while (p && p !== document.body) {
      if (p.contains(b)) return p;
      p = p.parentElement;
    }
    return null;
  }

  function fixEditionButtons() {
    if (window.innerWidth > 767) return;
    var museum = findControlByText('Museum Edition');
    var standard = findControlByText('Standard Edition');
    if (!museum || !standard) return;

    museum.classList.add('kh-edition-choice');
    standard.classList.add('kh-edition-choice');

    var parent = commonAncestor(museum, standard);
    if (!parent) return;

    // Prefer the smallest common container that is not one of the controls themselves.
    if (parent === museum || parent === standard) parent = parent.parentElement;
    if (parent) parent.classList.add('kh-edition-toggle-row');
  }

  function fixLoginButton() {
    if (window.innerWidth > 767) return;
    var checkoutRoot = document.querySelector('#wfacp-e-form, .wfacp_main_form, form.checkout, .woocommerce-checkout');
    if (!checkoutRoot) return;

    var nodes = checkoutRoot.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]');
    for (var i = 0; i < nodes.length; i++) {
      var label = nodes[i].tagName === 'INPUT' ? nodes[i].value : nodes[i].textContent;
      label = String(label || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (label === 'login' || label === 'log in') {
        nodes[i].classList.add('kh-smart-login-button');
        if (nodes[i].parentElement) nodes[i].parentElement.classList.add('kh-smart-login-row');
      }
    }
  }

  function shippingAnchor() {
    return document.querySelector(
      '#shipping_method, .woocommerce-shipping-methods, .woocommerce-shipping-totals, .wfacp_shipping_options, [class*="shipping-method"], [class*="shipping_method"]'
    );
  }

  function ensureShippingStatus() {
    if (!document.body.classList.contains('woocommerce-checkout') && !document.querySelector('form.checkout, #wfacp-e-form, .wfacp_main_form')) return null;
    var status = document.getElementById('kh-shipping-calculating');
    if (status) return status;

    status = document.createElement('div');
    status.id = 'kh-shipping-calculating';
    status.setAttribute('aria-live', 'polite');
    status.textContent = 'Calculating shipping…';

    var anchor = shippingAnchor();
    if (anchor && anchor.parentElement) {
      anchor.parentElement.insertBefore(status, anchor);
    } else {
      var form = document.querySelector('form.checkout, #wfacp-e-form, .wfacp_main_form');
      if (form) form.appendChild(status);
    }
    return status;
  }

  function showShippingStatus() {
    var status = ensureShippingStatus();
    if (status) status.classList.add('kh-visible');
  }

  function hideShippingStatus() {
    var status = document.getElementById('kh-shipping-calculating');
    if (status) status.classList.remove('kh-visible');
  }

  function shippingMethodsPresent() {
    return document.querySelectorAll('input[name^="shipping_method"], #shipping_method li, .woocommerce-shipping-methods li').length > 0;
  }

  function scan() {
    fixEditionButtons();
    fixLoginButton();
    if (shippingMethodsPresent()) hideShippingStatus();
  }

  if (window.jQuery) {
    window.jQuery(document.body)
      .on('update_checkout', function () { showShippingStatus(); })
      .on('updated_checkout', function () {
        if (shippingMethodsPresent()) hideShippingStatus();
        else showShippingStatus();
        window.setTimeout(scan, 50);
      })
      .on('checkout_error', function () { hideShippingStatus(); });
  }

  document.addEventListener('change', function (e) {
    if (!e.target || !e.target.matches) return;
    if (e.target.matches('#billing_country, #billing_state, #billing_postcode, #billing_city, #billing_address_1, #shipping_country, #shipping_state, #shipping_postcode, #shipping_city, #shipping_address_1')) {
      if (!shippingMethodsPresent()) showShippingStatus();
    }
  }, true);

  var observer = new MutationObserver(function () {
    window.clearTimeout(observer._khTimer);
    observer._khTimer = window.setTimeout(scan, 80);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('resize', scan);
  window.setTimeout(scan, 100);
  window.setTimeout(scan, 700);
  window.setTimeout(scan, 1600);
})();
</script>
    <?php
}, 100);
