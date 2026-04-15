/* MMA SF Handbook — Global Search
 * Triggered by Cmd/Ctrl+K or the sidebar search button.
 * Fetches search-index.json and shows a modal with cross-page results.
 */
(function () {
  'use strict';

  // ── Detect page depth (for building relative URLs in results) ────────────────
  var inPages = /\/pages\//.test(window.location.pathname) ||
                /[/\\]pages[/\\]/.test(window.location.href);

  // ── State ───────────────────────────────────────────────────────────────────
  // Index is loaded via <script src="search-index.js"> which sets
  // window.HANDBOOK_SEARCH_INDEX — no fetch() needed (works on file://).
  var searchIndex   = null;
  var currentItems  = [];
  var selectedIdx   = -1;
  var inputEl, resultsEl, backdropEl;

  // ── Inject CSS ──────────────────────────────────────────────────────────────
  var css = [
    /* Sidebar search button */
    '.gs-sidebar-btn{display:flex;align-items:center;gap:8px;margin:10px 14px 4px;',
    'padding:8px 12px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.13);',
    'border-radius:8px;cursor:pointer;font-size:13px;color:rgba(255,255,255,0.55);',
    'transition:all .15s;font-family:var(--font);width:calc(100% - 28px);text-align:left;}',
    '.gs-sidebar-btn:hover{background:rgba(255,255,255,0.13);color:rgba(255,255,255,0.9);}',
    '.gs-sb-text{flex:1;}',
    '.gs-sb-kbd{font-size:10px;padding:2px 5px;background:rgba(255,255,255,0.09);',
    'border:1px solid rgba(255,255,255,0.18);border-radius:4px;letter-spacing:0;}',

    /* Backdrop */
    '#gs-backdrop{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);',
    'z-index:9999;align-items:flex-start;justify-content:center;padding-top:80px;}',
    '#gs-backdrop.gs-open{display:flex;}',

    /* Modal */
    '#gs-modal{background:#fff;border-radius:14px;width:100%;max-width:620px;',
    'box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;',
    'display:flex;flex-direction:column;max-height:calc(100vh - 160px);}',

    /* Input row */
    '#gs-input-row{display:flex;align-items:center;gap:10px;padding:14px 18px;',
    'border-bottom:1px solid #e7e8e8;}',
    '#gs-input-icon{font-size:17px;flex-shrink:0;color:#aaa;}',
    '#gs-input{flex:1;border:none;outline:none;font-size:16px;',
    'font-family:var(--font,"Sohne","Helvetica Neue",Arial,sans-serif);color:#111;background:transparent;}',
    '#gs-input::placeholder{color:#bbb;}',
    '#gs-esc{font-size:11px;padding:3px 7px;background:#f3f4f6;border:1px solid #e5e7eb;',
    'border-radius:5px;color:#6b7280;flex-shrink:0;cursor:pointer;font-family:inherit;}',

    /* Results list */
    '#gs-results{overflow-y:auto;flex:1;}',
    '.gs-group-label{font-size:10px;font-weight:700;letter-spacing:.08em;',
    'text-transform:uppercase;color:#9ca3af;padding:12px 18px 4px;}',
    '.gs-item{display:block;padding:10px 18px;text-decoration:none;',
    'color:#111;border-left:3px solid transparent;transition:all .1s;cursor:pointer;}',
    '.gs-item:hover,.gs-item.gs-sel{background:#f7f8f8;border-left-color:#ffa400;}',
    '.gs-item-page{font-size:11px;color:#9ca3af;margin-bottom:3px;',
    'display:flex;align-items:center;gap:5px;}',
    '.gs-item-title{font-size:14px;font-weight:600;color:#111;margin-bottom:2px;}',
    '.gs-item-snippet{font-size:12.5px;color:#6b7280;line-height:1.5;',
    'font-family:"Tiempos Text",Georgia,serif;}',
    'mark.gs-hl{background:#fff3b0;color:inherit;border-radius:2px;padding:0 1px;}',

    /* Empty / footer */
    '#gs-empty{padding:40px 18px;text-align:center;color:#9ca3af;font-size:14px;}',
    '#gs-empty-icon{font-size:28px;margin-bottom:8px;}',
    '#gs-footer{padding:8px 18px;border-top:1px solid #e7e8e8;font-size:11px;',
    'color:#bbb;display:flex;gap:16px;}',
    '#gs-footer kbd{font-size:10px;padding:1px 5px;background:#f3f4f6;',
    'border:1px solid #e5e7eb;border-radius:4px;margin-right:3px;}',
  ].join('');

  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ── Inject backdrop + modal ─────────────────────────────────────────────────
  backdropEl = document.createElement('div');
  backdropEl.id = 'gs-backdrop';
  backdropEl.innerHTML = [
    '<div id="gs-modal">',
    '  <div id="gs-input-row">',
    '    <span id="gs-input-icon">🔍</span>',
    '    <input id="gs-input" type="search" placeholder="Search all handbook pages…"',
    '           autocomplete="off" spellcheck="false" />',
    '    <kbd id="gs-esc">ESC</kbd>',
    '  </div>',
    '  <div id="gs-results"></div>',
    '  <div id="gs-footer">',
    '    <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>',
    '    <span><kbd>↵</kbd> open</span>',
    '    <span><kbd>ESC</kbd> close</span>',
    '  </div>',
    '</div>',
  ].join('');
  document.body.appendChild(backdropEl);

  inputEl   = document.getElementById('gs-input');
  resultsEl = document.getElementById('gs-results');

  // ── Add sidebar button (if sidebar exists) ──────────────────────────────────
  var sidebarNav = document.querySelector('.sidebar-nav');
  if (sidebarNav) {
    var btn = document.createElement('button');
    btn.className = 'gs-sidebar-btn';
    btn.id        = 'gs-trigger';
    btn.setAttribute('aria-label', 'Open global search');
    btn.innerHTML = '<span>🔍</span><span class="gs-sb-text">Search handbook…</span><kbd class="gs-sb-kbd">⌘K</kbd>';
    sidebarNav.parentNode.insertBefore(btn, sidebarNav);
    btn.addEventListener('click', openModal);
  }

  // ── Utilities ───────────────────────────────────────────────────────────────
  function escHtml(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function hlText(text, q) {
    if (!q) return text;
    var re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'gi');
    return text.replace(re, '<mark class="gs-hl">$1</mark>');
  }

  function snippet(text, q, maxLen) {
    maxLen = maxLen || 130;
    if (!text) return '';
    var idx = text.toLowerCase().indexOf(q.toLowerCase());
    var start = Math.max(0, idx - 40);
    var chunk = (start > 0 ? '…' : '') + text.slice(start, start + maxLen);
    if (start + maxLen < text.length) chunk += '…';
    return chunk;
  }

  // ── Load index ──────────────────────────────────────────────────────────────
  function loadIndex(cb) {
    if (searchIndex) { cb(); return; }
    // Prefer the pre-loaded global (set by search-index.js script tag)
    if (window.HANDBOOK_SEARCH_INDEX) {
      searchIndex = window.HANDBOOK_SEARCH_INDEX;
      cb();
      return;
    }
    resultsEl.innerHTML = '<div id="gs-empty"><div class="gs-empty-icon">⚠️</div>' +
      'Search index not loaded. Make sure search-index.js is included.</div>';
  }

  // ── Search ──────────────────────────────────────────────────────────────────
  function runSearch(raw) {
    var q = raw.trim();
    if (!q || !searchIndex) { renderResults([], q); return; }
    var ql = q.toLowerCase();

    var hits = [];
    searchIndex.forEach(function (page) {
      page.sections.forEach(function (sec) {
        var titleL = (sec.title || '').toLowerCase();
        var textL  = (sec.text  || '').toLowerCase();
        var score  = 0;
        if (titleL === ql)          score += 10;
        else if (titleL.startsWith(ql)) score += 6;
        else if (titleL.includes(ql))   score += 4;
        if (textL.includes(ql))         score += 1;
        if (score > 0) {
          hits.push({
            page:    page.page,
            icon:    page.icon || '📄',
            url:     (inPages && !page.url.startsWith('pages/') ? '../' : (inPages ? '../' : '')) + page.url + (sec.id ? '#' + sec.id : ''),
            title:   sec.title,
            text:    sec.text,
            score:   score,
          });
        }
      });
    });

    hits.sort(function (a, b) { return b.score - a.score; });
    renderResults(hits.slice(0, 12), q);
  }

  // ── Render results ──────────────────────────────────────────────────────────
  function renderResults(items, q) {
    currentItems = items;
    selectedIdx  = items.length ? 0 : -1;
    q = q || '';

    if (!items.length) {
      if (q) {
        resultsEl.innerHTML = '<div id="gs-empty"><div class="gs-empty-icon">🔎</div>No results for <strong>' + escHtml(q) + '</strong></div>';
      } else {
        resultsEl.innerHTML = '';
      }
      return;
    }

    var html = '';
    var lastPage = null;
    items.forEach(function (item, i) {
      if (item.page !== lastPage) {
        html += '<div class="gs-group-label">' + escHtml(item.icon) + '  ' + escHtml(item.page) + '</div>';
        lastPage = item.page;
      }
      var snip = snippet(item.text, q);
      html += '<a class="gs-item' + (i === 0 ? ' gs-sel' : '') + '" href="' + escHtml(item.url) + '">';
      html += '<div class="gs-item-title">' + hlText(escHtml(item.title), q) + '</div>';
      if (snip) html += '<div class="gs-item-snippet">' + hlText(escHtml(snip), q) + '</div>';
      html += '</a>';
    });

    resultsEl.innerHTML = html;
  }

  function updateSelection() {
    var els = resultsEl.querySelectorAll('.gs-item');
    els.forEach(function (el, i) {
      el.classList.toggle('gs-sel', i === selectedIdx);
    });
    if (selectedIdx >= 0 && els[selectedIdx]) {
      els[selectedIdx].scrollIntoView({ block: 'nearest' });
    }
  }

  // ── Open / close ────────────────────────────────────────────────────────────
  function openModal() {
    backdropEl.classList.add('gs-open');
    inputEl.focus();
    inputEl.select();
    loadIndex(function () {
      if (inputEl.value.trim()) runSearch(inputEl.value);
    });
  }

  function closeModal() {
    backdropEl.classList.remove('gs-open');
    inputEl.value = '';
    renderResults([], '');
  }

  // ── Events ──────────────────────────────────────────────────────────────────
  // Keyboard shortcut
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (backdropEl.classList.contains('gs-open')) { closeModal(); } else { openModal(); }
    }
    if (!backdropEl.classList.contains('gs-open')) return;

    if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIdx = Math.min(selectedIdx + 1, currentItems.length - 1);
      updateSelection();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIdx = Math.max(selectedIdx - 1, 0);
      updateSelection();
    }
    if (e.key === 'Enter' && selectedIdx >= 0 && currentItems[selectedIdx]) {
      e.preventDefault();
      window.location.href = currentItems[selectedIdx].url;
    }
  });

  // Input
  var searchTimer;
  inputEl.addEventListener('input', function () {
    clearTimeout(searchTimer);
    var val = this.value;
    searchTimer = setTimeout(function () {
      loadIndex(function () { runSearch(val); });
    }, 150);
  });

  // Click backdrop to close
  backdropEl.addEventListener('click', function (e) {
    if (e.target === backdropEl) closeModal();
  });

  // ESC button
  document.getElementById('gs-esc').addEventListener('click', closeModal);

})();
