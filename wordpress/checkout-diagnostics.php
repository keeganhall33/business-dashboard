<?php
/**
 * KeeganHall checkout diagnostics instrumentation.
 * Install as a PHP snippet in Code Snippets and run on front end only.
 * Emits no customer PII. Sends only event names and coarse checkout state.
 */

add_action('wp_footer', function () {
    if (!function_exists('is_checkout') || !is_checkout() || is_order_received_page()) {
        return;
    }
    ?>
<script id="kh-checkout-diagnostics-v1">
(function () {
  'use strict';

  var fired = {};
  var lastShippingTotal = null;

  function deviceType() {
    var w = window.innerWidth || document.documentElement.clientWidth || 0;
    if (w <= 767) return 'mobile';
    if (w <= 1024) return 'tablet';
    return 'desktop';
  }

  function browserFamily() {
    var ua = navigator.userAgent || '';
    if (/CriOS|Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'chrome';
    if (/Edg\//.test(ua)) return 'edge';
    if (/Firefox\//.test(ua)) return 'firefox';
    if (/Safari\//.test(ua) && !/Chrome\//.test(ua) && !/CriOS/.test(ua)) return 'safari';
    return 'other';
  }

  function send(name, props, once) {
    if (once && fired[name]) return;
    if (once) fired[name] = true;

    var safe = Object.assign({
      checkout_diag_version: 'v1',
      device_class: deviceType(),
      browser_family: browserFamily(),
      page_path: location.pathname
    }, props || {});

    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', name, safe);
      } else {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push(Object.assign({event: name}, safe));
      }
    } catch (e) {}

    try {
      if (typeof window.clarity === 'function') {
        window.clarity('event', name);
        Object.keys(safe).forEach(function (key) {
          var value = safe[key];
          if (value !== null && value !== undefined && typeof value !== 'object') {
            window.clarity('set', 'checkout_' + key, String(value));
          }
        });
      }
    } catch (e) {}
  }

  function visible(el) {
    if (!el) return false;
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function requiredCustomerFieldsComplete() {
    var fields = Array.prototype.slice.call(document.querySelectorAll(
      '#billing_first_name, #billing_last_name, #billing_address_1, #billing_city, #billing_postcode, #billing_email, #shipping_first_name, #shipping_last_name, #shipping_address_1, #shipping_city, #shipping_postcode'
    ));
    var relevant = fields.filter(function (f) {
      var row = f.closest('.form-row');
      var required = row ? row.classList.contains('validate-required') : f.required;
      return required && visible(f);
    });
    if (!relevant.length) return false;
    return relevant.every(function (f) { return String(f.value || '').trim().length > 0; });
  }

  function paymentSection() {
    return document.querySelector('#payment, .woocommerce-checkout-payment, .wfacp-payment-dec, [class*="payment-method"], [class*="payment_methods"]');
  }

  function paymentMethodsLoaded() {
    return document.querySelectorAll('input[name="payment_method"], .payment_methods li, .wc_payment_method').length > 0;
  }

  function shippingMethodsLoaded() {
    return document.querySelectorAll('input[name^="shipping_method"], #shipping_method li, .woocommerce-shipping-methods li').length > 0;
  }

  function selectedShippingMethod() {
    var selected = document.querySelector('input[name^="shipping_method"]:checked, select[name^="shipping_method"]');
    return selected ? 'selected' : 'none';
  }

  function selectedPaymentMethod() {
    var selected = document.querySelector('input[name="payment_method"]:checked');
    if (!selected) return 'none';
    return String(selected.value || 'selected').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'selected';
  }

  function detectShippingTotal() {
    var el = document.querySelector('.woocommerce-shipping-totals .amount, tr.shipping .amount, .shipping-total .amount, [class*="shipping"] .woocommerce-Price-amount');
    if (!el) return null;
    var text = (el.textContent || '').replace(/[^0-9.,]/g, '').replace(',', '.');
    var n = parseFloat(text);
    return isFinite(n) ? Math.round(n * 100) / 100 : null;
  }

  function scan() {
    if (shippingMethodsLoaded()) {
      send('shipping_methods_loaded', {shipping_method_state: selectedShippingMethod()}, true);
    }

    var shippingTotal = detectShippingTotal();
    if (shippingTotal !== null && shippingTotal !== lastShippingTotal) {
      lastShippingTotal = shippingTotal;
      send('shipping_total_shown', {
        shipping_bucket: shippingTotal === 0 ? 'free' : (shippingTotal < 10 ? 'under_10' : (shippingTotal < 20 ? '10_to_20' : '20_plus'))
      }, false);
    }

    if (requiredCustomerFieldsComplete()) {
      send('customer_info_complete', {}, true);
    }

    var payment = paymentSection();
    if (payment && visible(payment)) {
      send('payment_section_visible', {}, true);
    }

    if (paymentMethodsLoaded()) {
      send('payment_methods_loaded', {}, true);
    }
  }

  send('checkout_loaded', {}, true);

  document.addEventListener('focusin', function (e) {
    if (e.target && e.target.matches && e.target.matches('input, select, textarea')) {
      send('customer_info_started', {}, true);
    }
  }, true);

  document.addEventListener('change', function (e) {
    if (!e.target || !e.target.matches) return;
    if (e.target.matches('input[name^="shipping_method"], select[name^="shipping_method"]')) {
      send('shipping_method_selected', {shipping_method_state: 'selected'}, false);
    }
    if (e.target.matches('input[name="payment_method"]')) {
      send('payment_method_selected', {payment_method: selectedPaymentMethod()}, false);
    }
    window.setTimeout(scan, 150);
  }, true);

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('#place_order, button[name="woocommerce_checkout_place_order"], .wfacp_next_page_button, [class*="place-order"] button') : null;
    if (btn) {
      send('place_order_clicked', {payment_method: selectedPaymentMethod()}, false);
    }
  }, true);

  if (window.jQuery) {
    window.jQuery(document.body)
      .on('updated_checkout', function () {
        window.setTimeout(scan, 100);
      })
      .on('checkout_error', function () {
        send('checkout_validation_error', {error_stage: 'woocommerce_checkout'}, false);
      })
      .on('payment_method_selected', function () {
        send('payment_method_selected', {payment_method: selectedPaymentMethod()}, false);
      });
  }

  window.addEventListener('error', function (e) {
    var src = String((e && e.filename) || '');
    var msg = String((e && e.message) || '');
    if (/checkout|woocommerce|stripe|paypal|payment|funnel|wfacp/i.test(src + ' ' + msg)) {
      send('checkout_validation_error', {error_stage: 'javascript'}, false);
    }
  });

  window.addEventListener('unhandledrejection', function () {
    send('checkout_validation_error', {error_stage: 'promise_rejection'}, false);
  });

  var observer = new MutationObserver(function () {
    window.clearTimeout(observer._t);
    observer._t = window.setTimeout(scan, 120);
  });
  observer.observe(document.documentElement, {childList: true, subtree: true});

  var payment = paymentSection();
  if (payment && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
          send('payment_section_visible', {}, true);
        }
      });
    }, {threshold: [0.25]});
    io.observe(payment);
  }

  window.setTimeout(scan, 500);
  window.setTimeout(scan, 1500);
})();
</script>
    <?php
}, 99);
