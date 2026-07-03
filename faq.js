// Shared FAQ behaviors for index.html and open-beta.html:
// table-of-contents highlighting, expand/hide-all toggles, and keyword search.
(function () {
  'use strict';

  // Highlight the active FAQ category in the side table of contents while scrolling.
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.faq-toc a'));
  if (tocLinks.length) {
    var byId = {};
    tocLinks.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          tocLinks.forEach(function (a) { a.classList.remove('active'); });
          var active = byId[entry.target.id];
          if (active) active.classList.add('active');
        }
      });
    }, { rootMargin: '0px 0px -70% 0px', threshold: 0 });

    document.querySelectorAll('.faq-group').forEach(function (group) { observer.observe(group); });
  }

  // Expand all / Hide all toggle for the FAQ section or each FAQ group.
  document.querySelectorAll('.faq-expand-toggle').forEach(function (btn) {
    var scope = btn.closest('.faq-group, .faq');
    if (!scope) return;
    var items = Array.prototype.slice.call(scope.querySelectorAll('details'));
    if (!items.length) return;

    function sync() {
      var allOpen = items.every(function (d) { return d.open; });
      btn.textContent = allOpen ? 'Hide all' : 'Expand all';
      btn.classList.toggle('is-open', allOpen);
    }

    btn.addEventListener('click', function () {
      var expand = !items.every(function (d) { return d.open; });
      items.forEach(function (d) { d.open = expand; });
      sync();
    });

    items.forEach(function (d) { d.addEventListener('toggle', sync); });
    sync();
  });

  // Direct links to individual questions, via a hover-revealed anchor after
  // the title. Opening a URL with a matching #hash expands that question.
  // Prefer a curated id="..." on the <details> tag (short, max 3 words);
  // the slug below is only a fallback for questions that don't have one yet.
  (function () {
    var items = Array.prototype.slice.call(document.querySelectorAll('.faq details'));
    if (!items.length) return;

    var STOP = ['a', 'an', 'the', 'i', 'my', 'me', 'to', 'do', 'does', 'can',
      'it', 'is', 'are', 'of', 'or', 'and', 'with', 'for', 'that', 'this',
      'on', 'in', 'how', 'what', 'when', 'will', 'you', 'use', 'using'];
    function slugify(text) {
      var words = (text || '').toLowerCase()
        .replace(/[‘’']/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim().split(/\s+/);
      var kept = words.filter(function (w) { return STOP.indexOf(w) === -1; });
      return (kept.length ? kept : words).slice(0, 3).join('-');
    }

    items.forEach(function (d) {
      var summary = d.querySelector('summary');
      if (!summary) return;

      if (!d.id) {
        var base = slugify(summary.textContent) || 'faq';
        var id = base, n = 2;
        while (document.getElementById(id)) { id = base + '-' + n++; }
        d.id = id;
      }

      var link = document.createElement('a');
      link.className = 'faq-link';
      link.href = '#' + d.id;
      link.setAttribute('aria-label', 'Direct link to this question');
      link.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 1.998 1.998 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a1.998 1.998 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 1.998 1.998 0 0 0-2.83 0l-2.5 2.5a1.998 1.998 0 0 0 0 2.83Z"/></svg>';
      // Clicking a link inside <summary> would also toggle the details;
      // cancel that and handle the navigation ourselves so the answer
      // always ends up open.
      link.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        d.open = true;
        if (location.hash === '#' + d.id) {
          d.scrollIntoView({ behavior: 'smooth' });
        } else {
          location.hash = d.id;
        }
      });
      summary.appendChild(link);
    });

    function openFromHash() {
      var id = location.hash.slice(1);
      if (!id) return;
      var el = document.getElementById(id);
      if (el && el.tagName === 'DETAILS') {
        el.open = true;
        el.scrollIntoView();
      }
    }
    window.addEventListener('hashchange', openFromHash);
    openFromHash();
  })();

  // FAQ search. Each <details> carries curated keywords in
  // <meta itemprop="keywords" content="..."> (schema.org Question microdata).
  // The primary pass matches against those keywords plus the question text;
  // only when that finds nothing does it fall back to the full answer text,
  // so broad words in answers don't drown out the curated matches.
  (function () {
    var input = document.querySelector('.faq-search-input');
    if (!input) return;
    var scope = input.closest('.faq');
    var items = Array.prototype.slice.call(scope.querySelectorAll('details'));
    var groups = Array.prototype.slice.call(scope.querySelectorAll('.faq-group'));

    // Fold non-breaking spaces and curly apostrophes so typed queries match
    // text written with &nbsp; and &rsquo;.
    function normalize(s) {
      return (s || '').toLowerCase()
        .replace(/ /g, ' ')
        .replace(/[‘’]/g, "'");
    }

    var index = items.map(function (d) {
      var meta = d.querySelector('meta[itemprop~="keywords"]');
      var summary = d.querySelector('summary');
      var answer = d.querySelector('.answer');
      return {
        el: d,
        primary: normalize((meta ? meta.getAttribute('content') : '') + ' ' +
                           (summary ? summary.textContent : '')),
        answer: normalize(answer ? answer.textContent : '')
      };
    });

    var status = document.createElement('p');
    status.className = 'faq-no-results';
    status.hidden = true;
    input.closest('h1, h2, h3').insertAdjacentElement('afterend', status);

    var resetLink = document.createElement('a');
    resetLink.href = '#';
    resetLink.textContent = 'Click here to view all FAQs again.';
    resetLink.addEventListener('click', function (e) {
      e.preventDefault();
      input.value = '';
      apply();
      input.focus();
    });

    function matchesAll(haystack, tokens) {
      return tokens.every(function (t) { return haystack.indexOf(t) !== -1; });
    }

    function apply() {
      var tokens = normalize(input.value).trim().split(/\s+/).filter(Boolean);
      if (!tokens.length) {
        items.forEach(function (d) { d.style.display = ''; d.open = false; });
        groups.forEach(function (g) { g.style.display = ''; });
        status.hidden = true;
        return;
      }

      var hits = index.filter(function (it) { return matchesAll(it.primary, tokens); });
      var usedFallback = false;
      if (!hits.length) {
        usedFallback = true;
        hits = index.filter(function (it) {
          return matchesAll(it.primary + ' ' + it.answer, tokens);
        });
      }

      index.forEach(function (it) {
        var match = hits.indexOf(it) !== -1;
        it.el.style.display = match ? '' : 'none';
        it.el.open = match;
      });
      groups.forEach(function (g) {
        var any = Array.prototype.some.call(g.querySelectorAll('details'), function (d) {
          return d.style.display !== 'none';
        });
        g.style.display = any ? '' : 'none';
      });

      status.hidden = false;
      if (hits.length === 0) {
        status.textContent = 'No FAQs match your search. ';
        status.appendChild(resetLink);
      } else {
        status.textContent = hits.length + (hits.length === 1 ? ' FAQ' : ' FAQs') +
          ' matched your search' + (usedFallback ? ' (found in answer text)' : '') + '.';
      }
    }

    input.addEventListener('input', apply);
  })();
})();
