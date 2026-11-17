/* Token Launch Radar, round 2 — the page logic. Reads window.RADAR from
   data.js, renders the board, and recomputes every row's implied value
   from the same four factors the program used, so the page and
   board.json always agree. */
(function () {
  var data = window.RADAR;
  if (!data) return;
  var rows = data.rows;
  var meta = data.meta;
  var topValue = rows.length ? rows[0].implied_value_usd : 1;

  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function trendChip(r) {
    var cls = r.trend === 'Surging' || r.trend === 'Rising' ? 'chip hot'
      : r.trend === 'Fading' || r.trend === 'Falling' ? 'chip cool' : 'chip flat';
    var age = r.years_tokenless === null || r.years_tokenless === undefined
      ? '' : '<span class="chip age">' + r.years_tokenless.toFixed(1) + 'y tokenless</span>';
    return '<span class="' + cls + '">' + esc(r.trend) + '</span>' + age;
  }

  /* Header: the model note and the counts. */
  el('model-note').textContent =
    'Implied value = TVL × category multiple (median market-cap-per-TVL of the category\'s live ' +
    'tokens with at least $10M TVL of their own, band 0.02–2.0; a category with fewer than three ' +
    'such tokens borrows the overall median and says so) × growth (seven-day TVL change at half ' +
    'weight, 0.80–1.40) × seasoning (diminishing, up to 1.37 for seven tokenless years) × reach ' +
    '(up to 1.24 across chains). No protocol name enters the arithmetic.';
  el('as-of').textContent = meta.as_of;
  el('stats').innerHTML =
    '<div><dt>Protocols in snapshot</dt><dd>' + meta.protocols_total + '</dd></div>' +
    '<div><dt>Watchlist</dt><dd>' + meta.watchlist_total + '</dd></div>' +
    '<div><dt>Ranked on the board</dt><dd>' + meta.board_total + '</dd></div>' +
    '<div><dt>Early finds below the floor</dt><dd>' + meta.early_total + '</dd></div>' +
    '<div><dt>Benchmark samples ≥ $10M TVL</dt><dd>' + meta.bench_samples_total + '</dd></div>' +
    '<div><dt>Live tokens (reference)</dt><dd>' + meta.live_total + '</dd></div>';

  /* Spotlight: the top three, clickable into the detail view. */
  el('spot-cards').innerHTML = rows.slice(0, 3).map(function (r, i) {
    return '<article class="spot-card" data-slug="' + esc(r.slug) + '">' +
      '<span class="pos">#' + (i + 1) + ' · ' + (r.scope === 'watchlist' ? 'WATCHLIST' : 'EARLY FIND') + '</span>' +
      '<h3>' + esc(r.name) + '</h3>' +
      '<p class="cat">' + esc(r.category) + ' · ' + esc(r.chains.join(', ')) + '</p>' +
      '<p class="val">' + money(r.implied_value_usd) + '</p>' +
      '<p class="sub">TVL ' + money(r.tvl_usd) + ' · ' + pct(r.change_7d) + ' in 7 days</p>' +
      '<p class="sub">' + trendChip(r) + '</p>' +
      '</article>';
  }).join('');

  /* Top ten chart: one bar per protocol, width against the leader. */
  el('chart').innerHTML = rows.slice(0, 10).map(function (r) {
    var w = Math.max(2, Math.round((r.implied_value_usd / topValue) * 100));
    return '<div class="bar-row" data-slug="' + esc(r.slug) + '">' +
      '<span class="bar-name">#' + r.rank + ' ' + esc(r.name) + '</span>' +
      '<span class="bar-track"><span class="bar-fill" style="display:block;width:' + w + '%"></span></span>' +
      '<span class="bar-val">' + money(r.implied_value_usd) + '</span></div>';
  }).join('');

  /* Filter option lists, built from the data itself. */
  var cats = [];
  var chains = [];
  rows.forEach(function (r) {
    if (cats.indexOf(r.category) < 0) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort();
  chains.sort();
  el('cat').innerHTML += cats.map(function (c) {
    return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
  }).join('');
  el('chain').innerHTML += chains.map(function (c) {
    return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
  }).join('');
  el('scope').innerHTML =
    '<option value="all">All ' + rows.length + ' ranked</option>' +
    '<option value="watchlist">Watchlist only (' + meta.watchlist_total + ')</option>' +
    '<option value="early">Early finds only (' + meta.early_total + ')</option>';

  var selected = null;

  /* The detail view: audit line first, then the breakdown recomputed
     from the row's own factors, then the farm plan. */
  function showDetail(r) {
    selected = r.slug;
    var recomputed = Math.round(r.tvl_usd * r.multiple * r.growth * r.seasoning * r.reach);
    var benchLine = r.bench_fallback
      ? 'benchmark fallback: only ' + r.bench_samples + ' live ' + esc(r.category) +
        ' token(s) with at least $10M TVL, so the overall median prices this row'
      : 'benchmark: median of ' + r.bench_samples + ' live ' + esc(r.category) +
        ' tokens with at least $10M TVL';
    var budgetMatch = r.farm_steps[0].match(/\$[\d,]+-\$[\d,]+/);
    var panel = el('detail');
    panel.classList.remove('hidden');
    panel.innerHTML =
      '<button class="close" type="button" data-close>Close ✕</button>' +
      '<h2>#' + r.rank + ' · ' + esc(r.name) + '</h2>' +
      '<p class="meta-line">' + esc(r.category) + ' · ' + esc(r.chains.join(', ')) +
      ' · TVL ' + money(r.tvl_usd) + ' · ' + pct(r.change_7d) + ' in 7 days · ' +
      (r.scope === 'watchlist' ? 'on the watchlist' : 'an early find below the floor') +
      (r.listed_at ? ' · tracked since ' + esc(r.listed_at) : '') + '</p>' +
      '<p class="why">Why this rank: ' + money(r.tvl_usd) + ' of TVL priced at the ' +
      esc(r.category) + ' median of ' + r.multiple.toFixed(2) + '×, tilted by a ' + esc(r.trend.toLowerCase()) +
      ' week (' + r.growth.toFixed(2) + '× growth) and ' +
      (r.years_tokenless === null ? 'an unproven history' : r.years_tokenless.toFixed(1) + ' tokenless years') +
      ' (' + r.seasoning.toFixed(2) + '× seasoning) across ' + r.chains.length + ' chain' +
      (r.chains.length === 1 ? '' : 's') + ' (' + r.reach.toFixed(2) + '× reach).</p>' +
      '<p class="audit">Audit: records no token (live tokens are benchmarks only, never ranked) · ' +
      benchLine + ' · every factor below is recomputed by this page from the row itself.</p>' +
      '<div class="breakdown">' +
      '<div class="factor"><div class="k">TVL</div><div class="v">' + money(r.tvl_usd) + '</div><div class="d">from the snapshot</div></div>' +
      '<div class="factor"><div class="k">× Category multiple</div><div class="v">' + r.multiple.toFixed(2) + '×</div><div class="d">' + r.bench_samples + ' live samples ≥ $10M TVL' + (r.bench_fallback ? ' (fallback)' : '') + '</div></div>' +
      '<div class="factor"><div class="k">× Growth</div><div class="v">' + r.growth.toFixed(2) + '×</div><div class="d">7-day change at half weight</div></div>' +
      '<div class="factor"><div class="k">× Seasoning</div><div class="v">' + r.seasoning.toFixed(2) + '×</div><div class="d">time running with no token</div></div>' +
      '<div class="factor"><div class="k">× Reach</div><div class="v">' + r.reach.toFixed(2) + '×</div><div class="d">' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + '</div></div>' +
      '<div class="factor"><div class="k">= Implied value</div><div class="v">' + money(r.implied_value_usd) + '</div><div class="d">recomputed: ' + money(recomputed) + '</div></div>' +
      '</div>' +
      '<h2>How to farm it</h2>' +
      '<p class="farm-summary">Plan at a glance: ' + r.farm_steps.length + ' steps' +
      (budgetMatch ? ' · working capital ' + budgetMatch[0] + ' scaled to its TVL' : '') +
      ' · pace set by its ' + esc(r.trend.toLowerCase()) + ' trend · route starts on ' +
      esc(r.chains[0] || 'its main chain') + (r.chains.length > 1 ? ' and reaches ' + (r.chains.length - 1) + ' more chain' + (r.chains.length > 2 ? 's' : '') : '') + '.</p>' +
      '<ol class="farm">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    document.querySelectorAll('#rows tr').forEach(function (tr) {
      tr.classList.toggle('selected', tr.dataset.slug === r.slug);
    });
  }

  /* Closing the overlay returns to the board. */
  el('detail').addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) {
      el('detail').classList.add('hidden');
      selected = null;
    }
  });

  /* The board table, filtered and sorted. */
  function visibleRows() {
    var q = el('q').value.trim().toLowerCase();
    var cat = el('cat').value;
    var chain = el('chain').value;
    var scope = el('scope').value;
    var trend = el('trend').value;
    var sort = el('sort').value;
    var out = rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      if (cat && r.category !== cat) return false;
      if (chain && r.chains.indexOf(chain) < 0) return false;
      if (scope !== 'all' && r.scope !== scope) return false;
      if (trend && r.trend !== trend) return false;
      return true;
    });
    var by = {
      value: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
      seasoning: function (a, b) { return (b.years_tokenless || 0) - (a.years_tokenless || 0); },
      name: function (a, b) { return a.name.localeCompare(b.name); },
    }[sort] || function (a, b) { return a.rank - b.rank; };
    out.sort(function (a, b) { return by(a, b) || a.slug.localeCompare(b.slug); });
    return out;
  }

  function renderBoard() {
    var list = visibleRows();
    el('count').textContent = list.length + ' of ' + rows.length + ' rows';
    el('rows').innerHTML = list.map(function (r) {
      var change = r.change_7d === null
        ? '<span>—</span>'
        : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + pct(r.change_7d) + '</span>';
      var w = Math.max(2, Math.round((r.implied_value_usd / topValue) * 100));
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><strong>' + esc(r.name) + '</strong><br><span style="color:var(--muted);font-size:12.5px">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category) + '</td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + change + '</td>' +
        '<td>' + trendChip(r) + '</td>' +
        '<td class="num">' + r.multiple.toFixed(2) + '×</td>' +
        '<td class="num"><strong>' + money(r.implied_value_usd) + '</strong><div class="valbar"><i style="width:' + w + '%"></i></div></td>' +
        '<td><span class="badge' + (r.scope === 'early' ? ' early' : '') + '">' + r.scope + '</span></td>' +
        '</tr>';
    }).join('');
  }

  /* Live-token reference and category benchmarks. */
  el('live-rows').innerHTML = data.live.map(function (p) {
    return '<tr><td><strong>' + esc(p.name) + '</strong></td><td>' + esc(p.category) +
      '</td><td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) +
      '</td><td class="num">' + p.ratio.toFixed(2) + '×</td></tr>';
  }).join('');
  el('bench-rows').innerHTML = data.benchmarks.map(function (b) {
    return '<tr><td><strong>' + esc(b.category) + '</strong></td><td class="num">' + b.live_samples +
      '</td><td class="num">' + b.median_multiple.toFixed(2) + '×</td><td>' +
      (b.fallback ? 'overall median (too few samples)' : 'category median') + '</td></tr>';
  }).join('');

  /* Tabs. */
  function showTab(name) {
    ['board', 'live', 'bench'].forEach(function (t) {
      el('view-' + t).classList.toggle('hidden', t !== name);
      el('tab-' + t).classList.toggle('active', t === name);
    });
  }
  el('tab-board').addEventListener('click', function () { showTab('board'); });
  el('tab-live').addEventListener('click', function () { showTab('live'); });
  el('tab-bench').addEventListener('click', function () { showTab('bench'); });

  /* Column headers sort the board. */
  document.querySelectorAll('.board thead th[data-sort]').forEach(function (th) {
    th.style.cursor = 'pointer';
    th.addEventListener('click', function () {
      var key = th.dataset.sort;
      el('sort').value = { rank: 'value', name: 'name', category: 'value', tvl: 'tvl', growth: 'growth', multiple: 'value', value: 'value' }[key] || 'value';
      renderBoard();
    });
  });

  ['q', 'cat', 'chain', 'scope', 'trend', 'sort'].forEach(function (id) {
    el(id).addEventListener('input', renderBoard);
    el(id).addEventListener('change', renderBoard);
  });

  function openFromEvent(e, selector) {
    var node = e.target.closest(selector);
    if (!node) return;
    var found = rows.find(function (r) { return r.slug === node.dataset.slug; });
    if (found) showDetail(found);
  }
  el('rows').addEventListener('click', function (e) { openFromEvent(e, 'tr'); });
  el('spot-cards').addEventListener('click', function (e) { openFromEvent(e, '.spot-card'); });
  el('chart').addEventListener('click', function (e) { openFromEvent(e, '.bar-row'); });

  renderBoard();

  /* Deep links, so a screenshot can open one view directly: #detail=<slug>,
     #scope=watchlist|early|all, #trend=<label>, or #tab=live|bench. */
  var hash = window.location.hash || '';
  var detailMatch = hash.match(/detail=([a-z0-9-]+)/);
  var scopeMatch = hash.match(/scope=(watchlist|early|all)/);
  var trendMatch = hash.match(/trend=(Surging|Rising|Steady|Fading|Falling)/);
  var tabMatch = hash.match(/tab=(live|bench)/);
  if (scopeMatch) el('scope').value = scopeMatch[1];
  if (trendMatch) el('trend').value = trendMatch[1];
  if (scopeMatch || trendMatch) renderBoard();
  if (tabMatch) showTab(tabMatch[1]);
  if (detailMatch) {
    var target = rows.find(function (r) { return r.slug === detailMatch[1]; });
    if (target) showDetail(target);
  }
  /* #table scrolls the board itself into view, so a filtered view can be
     captured as a screenshot without the masthead filling the frame. */
  if (hash.indexOf('table') >= 0) {
    var boardSection = el('view-board');
    if (boardSection) boardSection.scrollIntoView();
  }
})();
