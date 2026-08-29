<?php
/**
 * KeeganHall checkout diagnostics instrumentation v1.1.
 * Install as a PHP snippet in Code Snippets and run on front end only.
 * Emits no customer PII. Sends only event names and coarse checkout state.
 */

add_action('wp_footer', function () {
    if (!function_exists('is_checkout') || !is_checkout() || is_order_received_page()) {
        return;
    }
    ?>
<script id="kh-checkout-diagnostics-v11">
(function () {
  'use strict';

  var fired = {};
  var lastShippingTotal = null;
  var customerCompleteAt = null;
  var shippingUpdateStartedAt = null;
  var shippingMethodsFirstSeenAt = null;
  var shippingTotalFirstSeenAt = null;
  var ajaxUpdateStartedAt = null;
  var autofillCandidateAt = null;

  function now() {
    return (window.performance && typeof window.performance.now === 'function') ? window.performance.now() : Date.now();
  }

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

  function latencyBucket(ms) {
    if (ms === null || ms === undefined || !isFinite(ms)) return 'unknown';
    if (ms < 1000) return 'under_1s';
    if (ms < 2000) return '1_to_2s';
    if (ms < 4000) return '2_to_4s';
    if (ms < 6000) return '4_to_6s';
    if (ms < 10000) return '6_to_10s';
    return '10s_plus';
  }

  function emitLatencyEvent(prefix, ms) {
    var bucket = latencyBucket(ms);
    send(prefix + '_' + bucket, {latency_bucket: bucket}, true);
  }

  function ensureGtagQueue() {
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== 'function') {
      window.gtag = function () { window.dataLayer.push(arguments); };
    }
  }

  function send(name, props, once) {
    if (once && fired[name]) return;
    if (once) fired[name] = true;

    var safe = Object.assign({
      checkout_diag_version: 'v1_1',
      device_class: deviceType(),
      browser_family: browserFamily(),
      page_path: location.pathname
    }, props || {});

    try {
      ensureGtagQueue();
      window.gtag('event', name, safe);
      window.dataLayer.push(Object.assign({event: name}, safe));
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

  function customerFields() {
    return Array.prototype.slice.call(document.querySelectorAll(
      '#billing_first_name, #billing_last_name, #billing_address_1, #billing_city, #billing_state, #billing_postcode, #billing_email, #shipping_first_name, #shipping_last_name, #shipping_address_1, #shipping_city, #shipping_state, #shipping_postcode'
    ));
  }

  function requiredCustomerFieldsComplete() {
    var relevant = customerFields().filter(function (f) {
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

  function markCustomerComplete() {
    if (!requiredCustomerFieldsComplete()) return;
    if (customerCompleteAt === null) {
      customerCompleteAt = now();
      send('customer_info_complete', {}, true);
      if (autofillCandidateAt !== null && (customerCompleteAt - autofillCandidateAt) < 1500) {
        send('customer_info_autofill_detected', {autofill_detection: 'rapid_multi_field_completion'}, true);
      }
    }
  }

  function markShippingUpdateStarted(source) {
    if (shippingUpdateStartedAt === null) shippingUpdateStartedAt = now();
    send('shipping_update_started', {update_source: source || 'unknown'}, true);
  }

  function scan() {
    markCustomerComplete();

    if (shippingMethodsLoaded()) {
      if (shippingMethodsFirstSeenAt === null) {
        shippingMethodsFirstSeenAt = now();
        send('shipping_methods_loaded', {shipping_method_state: selectedShippingMethod()}, true);
        if (customerCompleteAt !== null) {
          emitLatencyEvent('shipping_methods_latency', shippingMethodsFirstSeenAt - customerCompleteAt);
        }
        if (shippingUpdateStartedAt !== null) {
          emitLatencyEvent('shipping_update_to_methods', shippingMethodsFirstSeenAt - shippingUpdateStartedAt);
        }
      }
    }

    var shippingTotal = detectShippingTotal();
    if (shippingTotal !== null && shippingTotal !== lastShippingTotal) {
      lastShippingTotal = shippingTotal;
      if (shippingTotalFirstSeenAt === null) {
        shippingTotalFirstSeenAt = now();
        if (customerCompleteAt !== null) {
          emitLatencyEvent('shipping_total_latency', shippingTotalFirstSeenAt - customerCompleteAt);
        }
      }
      send('shipping_total_shown', {
        shipping_bucket: shippingTotal === 0 ? 'free' : (shippingTotal < 10 ? 'under_10' : (shippingTotal < 20 ? '10_to_20' : '20_plus'))
      }, false);
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

  document.addEventListener('input', function (e) {
    if (!e.target || !e.target.matches || !e.target.matches('input, select, textarea')) return;
    var populated = customerFields().filter(function (f) { return visible(f) && String(f.value || '').trim().length > 0; }).length;
    if (populated >= 4 && autofillCandidateAt === null) autofillCandidateAt = now();
    window.setTimeout(scan, 50);
    window.setTimeout(scan, 300);
  }, true);

  document.addEventListener('change', function (e) {
    if (!e.target || !e.target.matches) return;
    if (e.target.matches('#billing_country, #billing_state, #billing_postcode, #billing_city, #billing_address_1, #shipping_country, #shipping_state, #shipping_postcode, #shipping_city, #shipping_address_1')) {
      markShippingUpdateStarted('address_change');
    }
    if (e.target.matches('input[name^="shipping_method"], select[name^="shipping_method"]')) {
      send('shipping_method_selected', {shipping_method_state: 'selected'}, false);
    }
    if (e.target.matches('input[name="payment_method"]')) {
      send('payment_method_selected', {payment_method: selectedPaymentMethod()}, false);
    }
    window.setTimeout(scan, 100);
    window.setTimeout(scan, 500);
  }, true);

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('#place_order, button[name="woocommerce_checkout_place_order"], .wfacp_next_page_button, [class*="place-order"] button') : null;
    if (btn) send('place_order_clicked', {payment_method: selectedPaymentMethod()}, false);
  }, true);

  if (window.jQuery) {
    var $ = window.jQuery;
    $(document.body)
      .on('update_checkout', function () {
        markShippingUpdateStarted('woocommerce_update_checkout');
      })
      .on('updated_checkout', function () {
        if (ajaxUpdateStartedAt !== null) {
          emitLatencyEvent('checkout_ajax_latency', now() - ajaxUpdateStartedAt);
          ajaxUpdateStartedAt = null;
        }
        window.setTimeout(scan, 50);
      })
      .on('checkout_error', function () {
        send('checkout_validation_error', {error_stage: 'woocommerce_checkout'}, false);
      })
      .on('payment_method_selected', function () {
        send('payment_method_selected', {payment_method: selectedPaymentMethod()}, false);
      });

    $(document).ajaxSend(function (_event, _xhr, settings) {
      var url = String((settings && settings.url) || '');
      var data = String((settings && settings.data) || '');
      if (/update_order_review|wc-ajax=update_order_review|wfacp|checkout/i.test(url + ' ' + data)) {
        ajaxUpdateStartedAt = now();
        markShippingUpdateStarted('ajax');
      }
    });

    $(document).ajaxError(function (_event, _xhr, settings) {
      var url = String((settings && settings.url) || '');
      if (/update_order_review|wc-ajax|wfacp|checkout|payment/i.test(url)) {
        send('checkout_ajax_error', {error_stage: 'ajax'}, false);
      }
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
    observer._t = window.setTimeout(scan, 80);
  });
  observer.observe(document.documentElement, {childList: true, subtree: true});

  window.setTimeout(scan, 200);
  window.setTimeout(scan, 750);
  window.setTimeout(scan, 1500);
})();
</script>
    <?php
}, 99);
