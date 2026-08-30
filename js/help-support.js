/**
 * help-support.js
 * NexRide — Help & Support Module
 *
 * Service layer + UI controller.
 * All FAQ/category data is static (works offline).
 * Support tickets are persisted to localStorage (Firestore-ready swap).
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// DATA / SERVICE LAYER
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'nexride_support_requests';

/** Return help categories */
function getHelpCategories() {
  return [
    { id: 'bus',      label: 'Bus & Routes',    icon: 'bus',     bg: 'transparent', color: '#2563EB' },
    { id: 'epass',    label: 'E-Pass',           icon: 'card',    bg: 'transparent', color: '#2563EB' },
    { id: 'payments', label: 'Payments & Fees',  icon: 'payment', bg: 'transparent', color: '#2563EB' },
    { id: 'safety',   label: 'Safety & SOS',     icon: 'shield',  bg: 'transparent', color: '#2563EB' },
  ];
}

/** Return all FAQs (or filtered by categoryId) */
function getFAQs(categoryId) {
  const all = [
    // ACCOUNT
    {
      id: 'acc-1', categoryId: 'account', categoryLabel: 'Account & Profile',
      question: 'How do I update my personal information?',
      answer: 'Go to Profile then Personal info then tap Edit. Update your name, gender, or email and tap Continue to save.',
      keywords: ['update', 'personal', 'info', 'name', 'profile', 'edit']
    },
    {
      id: 'acc-2', categoryId: 'account', categoryLabel: 'Account & Profile',
      question: 'How do I change my profile photo?',
      answer: 'Go to Profile then Personal info then Edit. Tap your profile picture to select a new photo from your gallery.',
      keywords: ['photo', 'picture', 'avatar', 'profile', 'change']
    },
    {
      id: 'acc-3', categoryId: 'account', categoryLabel: 'Account & Profile',
      question: 'How do I log out?',
      answer: 'Go to Profile and scroll down to find the Logout option. Tap it to securely sign out of your account.',
      keywords: ['logout', 'sign out', 'log out', 'signout']
    },
    // BUS
    {
      id: 'bus-1', categoryId: 'bus', categoryLabel: 'Bus & Routes',
      question: 'How do I find my bus?',
      answer: 'Tap the Bus icon on the home screen. Search for your bus number or stop name. Your assigned bus will appear in the results.',
      keywords: ['find', 'bus', 'search', 'route', 'stop']
    },
    {
      id: 'bus-2', categoryId: 'bus', categoryLabel: 'Bus & Routes',
      question: 'Why is my bus location not updating?',
      answer: 'This can happen when the bus device loses GPS signal or connectivity. Try refreshing the page. If the issue persists, contact support.',
      keywords: ['bus', 'location', 'not updating', 'tracking', 'gps']
    },
    {
      id: 'bus-3', categoryId: 'bus', categoryLabel: 'Bus & Routes',
      question: 'How do I check a bus route?',
      answer: 'In the Bus search page, select a bus to see all stops along its route and current live tracking information.',
      keywords: ['bus', 'route', 'stops', 'check']
    },
    // EPASS
    {
      id: 'ep-1', categoryId: 'epass', categoryLabel: 'E-Pass',
      question: 'How do I access my E-Pass?',
      answer: 'Tap the E-Pass icon on the home screen. Your digital pass will be displayed with your details and a barcode.',
      keywords: ['epass', 'e-pass', 'pass', 'access', 'digital']
    },
    {
      id: 'ep-2', categoryId: 'epass', categoryLabel: 'E-Pass',
      question: 'What should I do if my E-Pass is not showing?',
      answer: 'Ensure you are signed in and your profile is complete. If the pass is missing, it may not have been issued yet by your institution. Contact your administrator.',
      keywords: ['epass', 'e-pass', 'not showing', 'missing', 'blank']
    },
    {
      id: 'ep-3', categoryId: 'epass', categoryLabel: 'E-Pass',
      question: 'How do I check E-Pass validity?',
      answer: 'Your E-Pass displays validity information including fees status. If fees are unpaid, your pass may show as expired.',
      keywords: ['epass', 'e-pass', 'valid', 'validity', 'expire', 'expired']
    },
    // PAYMENTS
    {
      id: 'pay-1', categoryId: 'payments', categoryLabel: 'Payments & Fees',
      question: 'How do I pay my fees?',
      answer: 'Tap the Fees icon on the home screen to access the payment section. Follow the instructions to complete your fee payment.',
      keywords: ['fees', 'pay', 'payment', 'fee']
    },
    {
      id: 'pay-2', categoryId: 'payments', categoryLabel: 'Payments & Fees',
      question: 'Why did my payment fail?',
      answer: 'Payment failures can occur due to poor internet connectivity, bank server issues, or expired card details. Check your bank app and try again. Do not retry immediately if money was already deducted.',
      keywords: ['payment', 'failed', 'fail', 'declined', 'error']
    },
    {
      id: 'pay-3', categoryId: 'payments', categoryLabel: 'Payments & Fees',
      question: 'My payment was deducted but still shows pending. What should I do?',
      answer: 'Wait 24 hours as most pending payments resolve automatically. If not resolved, contact support with your transaction ID. Do not make a duplicate payment.',
      keywords: ['payment', 'deducted', 'pending', 'stuck', 'refund']
    },
    // REPORTS
    {
      id: 'rep-1', categoryId: 'reports', categoryLabel: 'Reports & Complaints',
      question: 'How do I report a problem?',
      answer: 'Tap Report an Issue on the Help and Support page. Select the issue category, describe the problem, and tap Submit.',
      keywords: ['report', 'complaint', 'problem', 'issue']
    },
    {
      id: 'rep-2', categoryId: 'reports', categoryLabel: 'Reports & Complaints',
      question: 'Can I track my complaint?',
      answer: 'Yes. Go to Help and Support then My Support Requests to view all your submitted requests and their current status.',
      keywords: ['track', 'complaint', 'ticket', 'status', 'request']
    },
    {
      id: 'rep-3', categoryId: 'reports', categoryLabel: 'Reports & Complaints',
      question: 'How do I update a submitted report?',
      answer: 'Open My Support Requests, tap the relevant ticket to view details. If the ticket is still open, you can view the current status and support responses.',
      keywords: ['update', 'report', 'submitted', 'ticket', 'edit']
    },
    // SAFETY
    {
      id: 'sos-1', categoryId: 'safety', categoryLabel: 'Safety & SOS',
      question: 'How does the SOS feature work?',
      answer: 'Triple-tap the blue NexRide banner on the home screen, then slide the indicator to confirm. Your emergency contacts receive a notification with your current location.',
      keywords: ['sos', 'safety', 'emergency', 'tap', 'slide']
    },
    {
      id: 'sos-2', categoryId: 'safety', categoryLabel: 'Safety & SOS',
      question: 'What happens when I activate SOS?',
      answer: 'Your trusted contacts are alerted with your GPS location. Always add trusted contacts in Profile then Safety then Trusted Contacts before you need this feature.',
      keywords: ['sos', 'activated', 'contacts', 'notified', 'location', 'gps']
    },
    {
      id: 'sos-3', categoryId: 'safety', categoryLabel: 'Safety & SOS',
      question: 'What should I do during an emergency?',
      answer: 'Activate SOS by triple-tapping the banner and sliding to confirm. You can also call emergency services directly: Police (100), Ambulance (108), Women Helpline (1091).',
      keywords: ['emergency', 'safety', 'sos', 'police', 'ambulance', 'helpline']
    },
    // NOTIFICATIONS
    {
      id: 'notif-1', categoryId: 'notifications', categoryLabel: 'Notifications',
      question: 'Why are notifications not appearing?',
      answer: 'Ensure notifications are enabled in your device settings for NexRide. Also check that you have not silenced the app under your phone notification manager.',
      keywords: ['notification', 'not appearing', 'missing', 'alert']
    },
    {
      id: 'notif-2', categoryId: 'notifications', categoryLabel: 'Notifications',
      question: 'How do I enable notifications for NexRide?',
      answer: 'On iOS: Settings then NexRide then Notifications then Allow. On Android: Settings then Apps then NexRide then Notifications then Enable.',
      keywords: ['enable', 'notification', 'permission', 'allow']
    },
    // TECHNICAL
    {
      id: 'tech-1', categoryId: 'technical', categoryLabel: 'Technical Issues',
      question: 'The app is not loading. What should I do?',
      answer: 'Check your Internet connection. Try refreshing the page. If on mobile, toggle Airplane mode off and back on. Clear your browser cache and reload.',
      keywords: ['not loading', 'app', 'loading', 'freeze', 'slow', 'blank']
    },
    {
      id: 'tech-2', categoryId: 'technical', categoryLabel: 'Technical Issues',
      question: 'Why is my location unavailable?',
      answer: 'Enable Location Services in your device settings and allow NexRide to access your location. On iOS: Settings then Privacy then Location Services then NexRide then While Using.',
      keywords: ['location', 'unavailable', 'gps', 'permission', 'enable']
    },
    {
      id: 'tech-3', categoryId: 'technical', categoryLabel: 'Technical Issues',
      question: 'The map is not showing. What should I do?',
      answer: 'This is usually a connectivity issue. Ensure you have a stable internet connection. If the problem persists, try refreshing the page or restarting the app.',
      keywords: ['map', 'not showing', 'blank', 'load', 'maps']
    },
  ];
  if (categoryId) return all.filter(function(f) { return f.categoryId === categoryId; });
  return all;
}

/** Case-insensitive search across FAQs */
function searchHelp(query) {
  if (!query || !query.trim()) return [];
  var q = query.toLowerCase().trim();
  return getFAQs().filter(function(faq) {
    return (
      faq.question.toLowerCase().includes(q) ||
      faq.answer.toLowerCase().includes(q) ||
      faq.categoryLabel.toLowerCase().includes(q) ||
      faq.keywords.some(function(k) { return k.toLowerCase().includes(q); })
    );
  });
}

/** Troubleshooting items */
function getTroubleshootingItems() {
  return [
    {
      id: 'tr-1',
      question: 'App is not loading',
      answer: 'Check your Internet connection. Refresh the page. Toggle Airplane mode off and on. Clear browser cache and reload. Contact support if the issue continues.'
    },
    {
      id: 'tr-2',
      question: 'Location is unavailable',
      answer: 'Enable Location Services on your device. Allow NexRide permission to access location. On iOS: Settings then Privacy then Location Services then NexRide. On Android: Settings then Apps then NexRide then Permissions then Location.'
    },
    {
      id: 'tr-3',
      question: 'Notifications are not working',
      answer: 'Check notification permissions for NexRide in device settings. Make sure the app is not in battery saver mode. Re-enable notifications if they were previously denied.'
    },
    {
      id: 'tr-4',
      question: 'Payment issue or unexpected deduction',
      answer: 'Do NOT retry immediately if money was deducted. Check your bank app for the transaction status. Wait up to 24 hours for automatic resolution. If not resolved, contact support with your transaction ID and screenshot.'
    },
  ];
}

/** Load support requests from localStorage */
function getSupportRequests() {
  return new Promise(function(resolve) {
    setTimeout(function() {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        var tickets = raw ? JSON.parse(raw) : [];
        resolve({ ok: true, data: tickets });
      } catch (e) {
        resolve({ ok: false, error: 'Failed to load requests.' });
      }
    }, 400);
  });
}

/** Get a single support request by ID */
function getSupportRequest(id) {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    var tickets = raw ? JSON.parse(raw) : [];
    return tickets.find(function(t) { return t.id === id; }) || null;
  } catch (e) {
    return null;
  }
}

/** Create a new support request */
function createSupportRequest(data) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        var tickets = raw ? JSON.parse(raw) : [];

        var id = 'NR-' + Date.now().toString(36).toUpperCase();
        var ticket = {
          id: id,
          category: data.category,
          description: data.description,
          status: 'submitted',
          createdAt: new Date().toISOString(),
          responses: [
            {
              from: 'System',
              message: 'Your request has been received. Our support team will review it shortly.',
              at: new Date().toISOString()
            }
          ]
        };

        tickets.unshift(ticket);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
        resolve({ ok: true, ticket: ticket });
      } catch (e) {
        reject(new Error('Failed to save request. Please try again.'));
      }
    }, 800);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(isoString) {
  if (!isoString) return '';
  var d = new Date(isoString);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function categoryLabel(cat) {
  var map = {
    bus: 'Bus Issue', epass: 'E-Pass Issue', payment: 'Payment Issue',
    app: 'App Technical Issue', safety: 'Safety Issue', other: 'Other'
  };
  return map[cat] || cat;
}

function statusClass(status) {
  var m = {
    'submitted': 'submitted',
    'in-review': 'in-review',
    'in-progress': 'in-progress',
    'resolved': 'resolved',
    'closed': 'closed'
  };
  return m[status] || 'submitted';
}

function statusLabel(status) {
  var m = {
    'submitted': 'Submitted',
    'in-review': 'In Review',
    'in-progress': 'In Progress',
    'resolved': 'Resolved',
    'closed': 'Closed'
  };
  return m[status] || 'Submitted';
}

function categorySVG(icon, color) {
  var fileMap = {
    bus: './routing.svg',
    card: './card-receive.svg',
    payment: './card-tick.svg',
    shield: './dent-dental-care-oral-health-toothbrush-teeth-cleaning.svg'
  };
  var file = fileMap[icon] || './assets/info-circle.svg';
  var size = (icon === 'shield') ? '28px' : '24px';
  return '<div style="width:' + size + '; height:' + size + '; background-color:' + color + '; -webkit-mask:url(\'' + file + '\') no-repeat center / contain; mask:url(\'' + file + '\') no-repeat center / contain;"></div>';
}

function chevronSVG() {
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM REFS
// ─────────────────────────────────────────────────────────────────────────────

function el(id) { return document.getElementById(id); }

var pages = {
  helpSupport:  el('help-support-page'),
  category:     el('hs-category-page'),
  report:       el('hs-report-page'),
  tickets:      el('hs-tickets-page'),
  ticketDetail: el('hs-ticket-detail-page'),
  chat:         el('hs-chat-page'),
  safety:       el('safety-page'),
};

// ─────────────────────────────────────────────────────────────────────────────
// PAGE NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────

function openPage(page) {
  if (!page) return;
  page.classList.remove('hidden');
  page.scrollTop = 0;
}

function closePage(page) {
  if (!page) return;
  page.classList.add('hidden');
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER: FAQ ACCORDION ITEM
// ─────────────────────────────────────────────────────────────────────────────

function createFAQItem(faq, container, showCategory) {
  var item = document.createElement('div');
  item.className = 'hs-faq-item';
  item.setAttribute('role', 'listitem');

  var catTag = showCategory
    ? '<span style="font-size:11px;font-weight:600;color:#2563EB;background:#F5F7FA;padding:2px 8px;border-radius:10px;margin-left:8px;white-space:nowrap;">' + faq.categoryLabel + '</span>'
    : '';

  item.innerHTML =
    '<button class="hs-faq-question" aria-expanded="false">' +
      '<span class="hs-faq-q-text">' + faq.question + catTag + '</span>' +
      '<span class="hs-faq-chevron" aria-hidden="true">' + chevronSVG() + '</span>' +
    '</button>' +
    '<div class="hs-faq-answer-wrap">' +
      '<div class="hs-faq-answer">' + faq.answer + '</div>' +
    '</div>';

  var btn = item.querySelector('.hs-faq-question');
  btn.addEventListener('click', function() {
    var isOpen = item.classList.contains('open');
    // Close siblings
    var siblings = container.querySelectorAll('.hs-faq-item.open');
    siblings.forEach(function(s) {
      if (s !== item) {
        s.classList.remove('open');
        s.querySelector('.hs-faq-question').setAttribute('aria-expanded', 'false');
      }
    });
    item.classList.toggle('open', !isOpen);
    btn.setAttribute('aria-expanded', String(!isOpen));
  });

  container.appendChild(item);
  return item;
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER: CATEGORIES GRID
// ─────────────────────────────────────────────────────────────────────────────

function renderCategories() {
  var grid = el('hs-categories-grid');
  if (!grid) return;
  grid.innerHTML = '';
  getHelpCategories().forEach(function(cat) {
    var btn = document.createElement('button');
    btn.className = 'hs-category-card';
    btn.setAttribute('role', 'listitem');
    btn.setAttribute('aria-label', cat.label);
    btn.innerHTML =
      '<div class="hs-cat-icon-wrap" style="background:' + cat.bg + ';">' + categorySVG(cat.icon, cat.color) + '</div>' +
      '<span class="hs-cat-label">' + cat.label + '</span>';
    btn.addEventListener('click', function() { openCategory(cat); });
    grid.appendChild(btn);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER: MAIN FAQ LIST (representative sample)
// ─────────────────────────────────────────────────────────────────────────────

function renderMainFAQs() {
  var list = el('hs-faq-list');
  if (!list) return;
  list.innerHTML = '';
  var faqs = getFAQs();
  var shown = {};
  var selected = [];
  for (var i = 0; i < faqs.length; i++) {
    var faq = faqs[i];
    var count = shown[faq.categoryId] || 0;
    if (count < 2) {
      selected.push(faq);
      shown[faq.categoryId] = count + 1;
    }
    if (selected.length >= 10) break;
  }
  selected.forEach(function(faq) { createFAQItem(faq, list, false); });
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER: TROUBLESHOOTING
// ─────────────────────────────────────────────────────────────────────────────

function renderTroubleshooting() {
  var list = el('hs-troubleshooting-list');
  if (!list) return;
  list.innerHTML = '';
  getTroubleshootingItems().forEach(function(item) { createFAQItem(item, list, false); });
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────────────────────────────────────

var searchDebounceTimer = null;

function initSearch() {
  var input = el('hs-search-input');
  var clearBtn = el('hs-clear-btn');
  if (!input) return;

  input.addEventListener('input', function() {
    var val = input.value;
    if (clearBtn) {
      clearBtn.style.display = val ? 'block' : 'none';
      clearBtn.classList.toggle('hidden', !val);
    }
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(function() { runSearch(val); }, 200);
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      input.value = '';
      clearBtn.style.display = 'none';
      clearBtn.classList.add('hidden');
      runSearch('');
      input.focus();
    });
  }
}

function runSearch(query) {
  var defaultContent = el('hs-default-content');
  var resultsSection = el('hs-search-results');
  var resultsList    = el('hs-search-results-list');
  var noResults      = el('hs-no-results');
  var countEl        = el('hs-search-count');

  if (!query || !query.trim()) {
    if (defaultContent) defaultContent.style.display = 'flex';
    if (resultsSection) { resultsSection.style.display = 'none'; resultsSection.classList.add('hidden'); }
    return;
  }

  if (defaultContent) defaultContent.style.display = 'none';
  if (resultsSection) { resultsSection.style.display = 'flex'; resultsSection.classList.remove('hidden'); }

  var results = searchHelp(query);

  if (resultsList) resultsList.innerHTML = '';

  if (results.length === 0) {
    if (noResults) { noResults.style.display = 'block'; noResults.classList.remove('hidden'); }
    if (countEl) countEl.textContent = '';
    return;
  }

  if (noResults) { noResults.style.display = 'none'; noResults.classList.add('hidden'); }
  if (countEl) countEl.textContent = results.length + ' result' + (results.length !== 1 ? 's' : '') + ' for "' + query + '"';
  results.forEach(function(faq) { createFAQItem(faq, resultsList, true); });
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY DRILL-DOWN
// ─────────────────────────────────────────────────────────────────────────────

function openCategory(cat) {
  var titleEl = el('hs-category-title');
  var listEl  = el('hs-category-faq-list');
  if (!titleEl || !listEl) return;

  titleEl.textContent = cat.label;
  listEl.innerHTML = '';

  var faqs = getFAQs(cat.id);
  if (faqs.length === 0) {
    listEl.innerHTML = '<p style="padding:24px;text-align:center;color:#9CA3AF;font-size:14px;">No articles in this category yet.</p>';
  } else {
    faqs.forEach(function(faq) { createFAQItem(faq, listEl, false); });
  }

  openPage(pages.category);
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT AN ISSUE
// ─────────────────────────────────────────────────────────────────────────────

var isSubmitting = false;

function initReportPage() {
  var catEl      = el('hs-report-category');
  var descEl     = el('hs-report-description');
  var charCount  = el('hs-report-char-count');
  var submitBtn  = el('hs-report-submit-btn');
  var errorEl    = el('hs-report-error');
  var successEl  = el('hs-report-success');
  var formEl     = el('hs-report-form-content');
  var footerEl   = el('hs-report-form-content-footer');
  var ticketIdEl = el('hs-report-ticket-id');
  var doneBtn    = el('hs-report-done-btn');
  var offlineMsg = el('hs-report-offline-msg');

  if (!submitBtn) return;

  if (descEl && charCount) {
    descEl.addEventListener('input', function() {
      var len = descEl.value.length;
      if (len > 500) descEl.value = descEl.value.slice(0, 500);
      charCount.textContent = Math.min(len, 500) + ' / 500';
    });
    descEl.addEventListener('focus', function() {
      setTimeout(function() { descEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
    });
    descEl.addEventListener('focus', function() { descEl.style.borderColor = '#2563EB'; });
    descEl.addEventListener('blur',  function() { descEl.style.borderColor = '#E5E7EB'; });
  }

  if (catEl) {
    catEl.addEventListener('focus', function() { catEl.style.borderColor = '#2563EB'; });
    catEl.addEventListener('blur',  function() { catEl.style.borderColor = '#E5E7EB'; });
  }

  submitBtn.addEventListener('click', function() {
    if (isSubmitting) return;

    if (errorEl)    { errorEl.style.display = 'none';    errorEl.classList.add('hidden'); }
    if (offlineMsg) { offlineMsg.style.display = 'none'; offlineMsg.classList.add('hidden'); }

    if (!navigator.onLine) {
      if (offlineMsg) { offlineMsg.style.display = 'block'; offlineMsg.classList.remove('hidden'); }
      return;
    }

    var category    = catEl    ? catEl.value.trim()    : '';
    var description = descEl   ? descEl.value.trim()   : '';

    if (!category) {
      showReportError('Please select an issue category.', catEl);
      return;
    }
    if (description.length < 10) {
      showReportError('Please describe the issue in at least 10 characters.', descEl);
      return;
    }

    isSubmitting = true;
    submitBtn.classList.add('hs-submit-loading');
    submitBtn.disabled = true;

    createSupportRequest({ category: category, description: description }).then(function(result) {
      if (result.ok) {
        if (formEl)     formEl.style.display = 'none';
        if (footerEl)   footerEl.style.display = 'none';
        if (successEl)  { successEl.style.display = 'block'; successEl.classList.remove('hidden'); }
        if (ticketIdEl) ticketIdEl.textContent = 'Your ticket ID: ' + result.ticket.id;
        if (catEl)      catEl.value = '';
        if (descEl)     descEl.value = '';
        if (charCount)  charCount.textContent = '0 / 500';
      }
    }).catch(function(e) {
      showReportError(e.message || 'Failed to submit. Please try again.');
    }).finally(function() {
      isSubmitting = false;
      submitBtn.classList.remove('hs-submit-loading');
      submitBtn.disabled = false;
    });
  });

  if (doneBtn) {
    doneBtn.addEventListener('click', function() {
      closePage(pages.report);
      if (successEl) { successEl.style.display = 'none'; successEl.classList.add('hidden'); }
      if (formEl)    formEl.style.display = 'block';
      if (footerEl)  footerEl.style.display = 'block';
    });
  }
}

function showReportError(msg, focusEl) {
  var errorEl = el('hs-report-error');
  if (errorEl) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
    errorEl.classList.remove('hidden');
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  if (focusEl) focusEl.focus();
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORT TICKETS LIST
// ─────────────────────────────────────────────────────────────────────────────

function loadTickets() {
  var loading = el('hs-tickets-loading');
  var errorEl = el('hs-tickets-error');
  var emptyEl = el('hs-tickets-empty');
  var listEl  = el('hs-tickets-list');

  if (loading) loading.style.display = 'block';
  if (errorEl) { errorEl.style.display = 'none'; errorEl.classList.add('hidden'); }
  if (emptyEl) { emptyEl.style.display = 'none'; emptyEl.classList.add('hidden'); }
  if (listEl)  { listEl.style.display = 'none'; listEl.classList.add('hidden'); listEl.innerHTML = ''; }

  getSupportRequests().then(function(result) {
    if (loading) loading.style.display = 'none';

    if (!result.ok) {
      if (errorEl) { errorEl.style.display = 'block'; errorEl.classList.remove('hidden'); }
      return;
    }

    var tickets = result.data;
    if (tickets.length === 0) {
      if (emptyEl) { emptyEl.style.display = 'block'; emptyEl.classList.remove('hidden'); }
      return;
    }

    if (listEl) {
      listEl.style.display = 'flex';
      listEl.classList.remove('hidden');
      tickets.forEach(function(ticket) {
        var card = document.createElement('button');
        card.className = 'hs-ticket-card';
        card.setAttribute('role', 'listitem');
        card.setAttribute('aria-label', 'Ticket ' + ticket.id + ' status ' + statusLabel(ticket.status));
        var desc = ticket.description.slice(0, 80) + (ticket.description.length > 80 ? '\u2026' : '');
        card.innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">' +
            '<span style="font-size:12px;font-weight:700;color:#6B7280;letter-spacing:0.5px;">' + ticket.id + '</span>' +
            '<span class="hs-status-badge ' + statusClass(ticket.status) + '">' + statusLabel(ticket.status) + '</span>' +
          '</div>' +
          '<div style="font-size:14px; font-weight:600; color:#111827; line-height:1.6; margin-bottom:4px;">' + categoryLabel(ticket.category) + '</div>' +
          '<div style="font-size:13px;color:#6B7280;">' + formatDate(ticket.createdAt) + '</div>' +
          '<div style="font-size:13px;color:#9CA3AF;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;">' + desc + '</div>';
        card.addEventListener('click', function() { openTicketDetail(ticket.id); });
        listEl.appendChild(card);
      });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TICKET DETAIL
// ─────────────────────────────────────────────────────────────────────────────

function openTicketDetail(id) {
  var ticket = getSupportRequest(id);
  var contentEl = el('hs-ticket-detail-content');
  if (!contentEl) return;

  if (!ticket) {
    contentEl.innerHTML = '<p style="text-align:center;color:#9CA3AF;padding:40px;">Ticket not found.</p>';
    openPage(pages.ticketDetail);
    return;
  }

  var responsesHTML = (ticket.responses || []).map(function(r) {
    return '<div style="background:#F8F9FA;border-radius:12px;padding:14px 16px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
        '<span style="font-size:13px;font-weight:700;color:#111827;">' + r.from + '</span>' +
        '<span style="font-size:11px;color:#9CA3AF;">' + formatDate(r.at) + '</span>' +
      '</div>' +
      '<p style="font-size:14px;color:#374151;margin:0;line-height:1.6;font-weight:500;text-align:left;">' + r.message + '</p>' +
    '</div>';
  }).join('');

  var resolvedBanner = (ticket.status === 'resolved' || ticket.status === 'closed')
    ? '<div style="background:#F0FDF4;border-radius:14px;padding:16px 18px;">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>' +
          '<span style="font-size:14px;font-weight:700;color:#15803D;">Request ' + statusLabel(ticket.status) + '</span>' +
        '</div>' +
        '<p style="font-size:13px;color:#16A34A;margin:0;">This support request has been ' + ticket.status + '. If your issue persists, please submit a new request.</p>' +
      '</div>'
    : '';

  contentEl.innerHTML =
    '<div style="background:#FFFFFF;border-radius:16px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">' +
        '<span style="font-size:12px;font-weight:700;color:#6B7280;letter-spacing:0.5px;">' + ticket.id + '</span>' +
        '<span class="hs-status-badge ' + statusClass(ticket.status) + '">' + statusLabel(ticket.status) + '</span>' +
      '</div>' +
      '<h3 style="font-size:17px;font-weight:700;color:#111827;margin:0 0 6px 0;">' + categoryLabel(ticket.category) + '</h3>' +
      '<p style="font-size:13px;color:#9CA3AF;margin:0 0 16px 0;">Submitted on ' + formatDate(ticket.createdAt) + '</p>' +
      '<div style="background:#F8F9FA;border-radius:10px;padding:14px 16px;">' +
        '<p style="font-size:14px;font-weight:600;color:#111827;margin:0 0 6px 0;">Issue Description</p>' +
        '<p style="font-size:14px;color:#374151;margin:0;line-height:1.6;font-weight:500;text-align:left;">' + ticket.description + '</p>' +
      '</div>' +
    '</div>' +
    '<div>' +
      '<h4 style="font-size:14px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 12px 0;">Support Responses</h4>' +
      '<div style="display:flex;flex-direction:column;gap:10px;">' +
        (responsesHTML || '<p style="font-size:14px;color:#9CA3AF;text-align:center;">No responses yet.</p>') +
      '</div>' +
    '</div>' +
    resolvedBanner;

  openPage(pages.ticketDetail);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

function initContactActions() {
  var callBtn  = el('hs-call-btn');
  var emailBtn = el('hs-email-btn');
  var chatBtn  = el('hs-chat-btn');

  if (callBtn) {
    callBtn.addEventListener('click', function() {
      window.location.href = 'tel:+918000000000';
    });
  }

  if (emailBtn) {
    emailBtn.addEventListener('click', function() {
      var subject = encodeURIComponent('NexRide Support Request');
      var body    = encodeURIComponent('Hi NexRide Support Team,\n\nI need help with:\n\n[Please describe your issue here]\n\nThank you.');
      window.location.href = 'mailto:support@nexride.in?subject=' + subject + '&body=' + body;
    });
  }

  if (chatBtn) {
    chatBtn.addEventListener('click', function() { openPage(pages.chat); });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OFFLINE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

function updateOfflineBanner() {
  var banner = el('hs-offline-banner');
  if (!banner) return;
  if (!navigator.onLine) {
    banner.style.display = 'flex';
    banner.classList.remove('hidden');
  } else {
    banner.style.display = 'none';
    banner.classList.add('hidden');
  }
}

function initOfflineDetection() {
  window.addEventListener('online',  updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);
  updateOfflineBanner();
}

// ─────────────────────────────────────────────────────────────────────────────
// KEYBOARD AVOIDANCE (visualViewport API)
// ─────────────────────────────────────────────────────────────────────────────

function initKeyboardAvoidance() {
  if (!window.visualViewport) return;

  function handleResize() {
    var keyboardHeight = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
    var footerEl = el('hs-report-form-content-footer');
    if (footerEl) {
      if (keyboardHeight > 50) {
        footerEl.style.paddingBottom = (keyboardHeight + 16) + 'px';
      } else {
        footerEl.style.paddingBottom = 'calc(20px + env(safe-area-inset-bottom))';
      }
    }
  }

  window.visualViewport.addEventListener('resize', handleResize);
  window.visualViewport.addEventListener('scroll', handleResize);
}

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION WIRING
// ─────────────────────────────────────────────────────────────────────────────

function wireNavigation() {
  // Profile list → Help & Support
  var openBtn = el('help-support-btn');
  if (openBtn) {
    openBtn.addEventListener('click', function() {
      updateOfflineBanner();
      openPage(pages.helpSupport);
    });
  }

  // Help & Support → back to Profile
  var backHS = el('back-help-support');
  if (backHS) {
    backHS.addEventListener('click', function() { closePage(pages.helpSupport); });
  }

  // Category drill-down back
  var backCat = el('back-hs-category');
  if (backCat) {
    backCat.addEventListener('click', function() { closePage(pages.category); });
  }

  // Report
  var reportNavBtn = el('hs-report-nav-btn');
  if (reportNavBtn) {
    reportNavBtn.addEventListener('click', function() {
      if (window.openReportIssuePage) {
        window.openReportIssuePage();
      } else {
        openPage(pages.report);
      }
    });
  }
  var backReport = el('back-hs-report');
  if (backReport) {
    backReport.addEventListener('click', function() {
      closePage(pages.report);
      var successEl = el('hs-report-success');
      var formEl    = el('hs-report-form-content');
      var footerEl  = el('hs-report-form-content-footer');
      if (successEl) { successEl.style.display = 'none'; successEl.classList.add('hidden'); }
      if (formEl)    formEl.style.display = 'block';
      if (footerEl)  footerEl.style.display = 'block';
    });
  }

  // Tickets
  var ticketsNavBtn = el('hs-tickets-nav-btn');
  if (ticketsNavBtn) {
    ticketsNavBtn.addEventListener('click', function() {
      if (window.openMyReportsPage) {
        window.openMyReportsPage();
      } else {
        openPage(pages.tickets);
        loadTickets();
      }
    });
  }
  var backTickets = el('back-hs-tickets');
  if (backTickets) {
    backTickets.addEventListener('click', function() { closePage(pages.tickets); });
  }

  var retryBtn = el('hs-tickets-retry-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', loadTickets);
  }

  // Ticket detail
  var backDetail = el('back-hs-ticket-detail');
  if (backDetail) {
    backDetail.addEventListener('click', function() { closePage(pages.ticketDetail); });
  }

  // Chat
  var backChat = el('back-hs-chat');
  if (backChat) {
    backChat.addEventListener('click', function() { closePage(pages.chat); });
  }

  // SOS link
  var sosLinkBtn = el('hs-sos-link-btn');
  if (sosLinkBtn) {
    sosLinkBtn.addEventListener('click', function() {
      if (pages.safety) openPage(pages.safety);
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────

function init() {
  // Refresh page refs (DOM is ready at this point)
  pages.helpSupport  = el('help-support-page');
  pages.category     = el('hs-category-page');
  pages.report       = el('hs-report-page');
  pages.tickets      = el('hs-tickets-page');
  pages.ticketDetail = el('hs-ticket-detail-page');
  pages.chat         = el('hs-chat-page');
  pages.safety       = el('safety-page');

  renderCategories();
  renderMainFAQs();
  renderTroubleshooting();
  initSearch();
  initContactActions();
  initReportPage();
  wireNavigation();
  initOfflineDetection();
  initKeyboardAvoidance();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
