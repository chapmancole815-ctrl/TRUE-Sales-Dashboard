/* ═══════════════════════════════════════════════════════════════
   TRUE SPORTS — SALES DASHBOARD  |  dashboard.js
   Orchestrator: business logic, rankings, scoring, DOM updates.
   Depends on: dataService.js (DS), components.js (UI)
   ═══════════════════════════════════════════════════════════════ */

'use strict';

(function (window) {

  /* ─────────────────────────────────────────────
     1. APP STATE
  ───────────────────────────────────────────────── */
  const State = {
    dataset:     null,   // full parsed dataset from DS
    filtered:    null,   // currently filtered view
    currency:    'USD',
    thresholds:  { red: 0.75, yellow: 0.90 },
    mode:        'file', // 'url' | 'file'
    csvUrl:      '',
    activeFile:  null,   // File object if user uploaded
    filters:     { region: 'all', month: 'all', category: 'all', week: 'latest' },
    sorts: {
      budget:  { key: 'pctToBudget', dir: 'desc' },
      margin:  { key: 'marginPct',   dir: 'desc' },
      newbiz:  { key: 'newBizWeek',  dir: 'desc' },
    },
    workhorse: { month: null },
    configOpen: false,
  };

  /* ─────────────────────────────────────────────
     2. ELEMENT SHORTCUTS
  ───────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  /* ─────────────────────────────────────────────
     3. FORMATTING SHORTCUTS
  ───────────────────────────────────────────────── */
  const fmt  = (v) => DS.formatMoney(v, State.currency);
  const fmtp = DS.formatPct;

  /* ─────────────────────────────────────────────
     4. THRESHOLD COLOUR HELPER
  ───────────────────────────────────────────────── */
  function thresholdClass(pct) {
    if (pct >= State.thresholds.yellow) return 'green';
    if (pct >= State.thresholds.red)    return 'yellow';
    return 'red';
  }

  function thresholdTextClass(pct) {
    const c = thresholdClass(pct);
    if (c === 'green')  return 'text-green';
    if (c === 'yellow') return 'text-yellow';
    return 'text-red';
  }

  /* ─────────────────────────────────────────────
     5. NORMALIZATION HELPER (for WH scoring)
  ───────────────────────────────────────────────── */
  function normalizeArray(arr, key) {
    const vals = arr.map(x => x[key]);
    const min  = Math.min(...vals);
    const max  = Math.max(...vals);
    const range = max - min;
    return arr.map(x => ({ ...x, [`_norm_${key}`]: range > 0 ? (x[key] - min) / range : 0 }));
  }

  /* ─────────────────────────────────────────────
     6. RANKINGS ENGINE
  ───────────────────────────────────────────────── */

  /* Sort rep summaries by a field */
  function sortReps(reps, key, dir = 'desc') {
    return [...reps].sort((a, b) => dir === 'desc' ? b[key] - a[key] : a[key] - b[key]);
  }

  /* % to budget rankings — fall back to totalYtd if no budgets configured */
  function rankByBudget(reps) {
    const hasBudgets = reps.some(r => r.budgetYtd > 0);
    return hasBudgets
      ? sortReps(reps, 'pctToBudget', 'desc')
      : sortReps(reps, 'totalYtd', 'desc');
  }

  /* Margin rankings */
  function rankByMargin(reps) {
    return sortReps(reps, 'marginPct', 'desc');
  }

  /* New business rankings */
  function rankByNewBiz(reps) {
    return sortReps(reps, 'newBizWeek', 'desc');
  }

  /* Category top-5 reps — aggregates transactional rows for one category */
  function topRepsByCategory(dataset, category) {
    const catRows = dataset.rows.filter(r => r.category === category);
    const budgets = DS.getBudgets ? DS.getBudgets() : {};
    const byRep   = new Map();
    catRows.forEach(r => {
      const k = r.repName;
      if (!byRep.has(k)) byRep.set(k, {
        repId: r.repName.toLowerCase().replace(/\s+/g, '_'),
        repName: r.repName, territory: r.territory, region: r.region,
        shippedYtd: 0, openYtd: 0, totalYtd: 0,
        marginDollar: 0, marginPct: 0,
        budgetYtd: budgets[r.repName] || 0, pctToBudget: 0,
      });
      const cur = byRep.get(k);
      if (r.isShipped) cur.shippedYtd += r.salesAmt;
      else             cur.openYtd    += r.salesAmt;
      cur.totalYtd    = cur.shippedYtd + cur.openYtd;
      cur.marginDollar += r.profit;
      cur.marginPct    = cur.totalYtd > 0 ? cur.marginDollar / cur.totalYtd : 0;
      cur.pctToBudget  = cur.budgetYtd > 0 ? cur.totalYtd / cur.budgetYtd : 0;
    });
    const reps    = [...byRep.values()];
    const hasBudg = reps.some(r => r.budgetYtd > 0);
    return sortReps(reps, hasBudg ? 'pctToBudget' : 'totalYtd', 'desc').slice(0, 5);
  }

  /* ─────────────────────────────────────────────
     7. WORKHORSE SCORING
     score = 0.5*(pctBudget norm)
           + 0.3*(newBiz norm)
           + 0.2*(marginPct norm)
  ───────────────────────────────────────────────── */
  function computeWorkHorseScores(reps) {
    if (!reps.length) return [];
    let scored = reps.map(r => ({
      ...r,
      pctToBudget: r.pctToBudget || 0,
      newBizWeek:  r.newBizWeek  || 0,
      marginPct:   r.marginPct   || 0,
    }));
    scored = normalizeArray(scored, 'pctToBudget');
    scored = normalizeArray(scored, 'newBizWeek');
    scored = normalizeArray(scored, 'marginPct');
    scored = scored.map(r => ({
      ...r,
      whScore: (0.5 * r._norm_pctToBudget) +
               (0.3 * r._norm_newBizWeek)  +
               (0.2 * r._norm_marginPct),
    }));
    return sortReps(scored, 'whScore', 'desc');
  }

  /* Build "why they won" bullet list for workhorse winner */
  function buildWhyBullets(winner, rankedByBudget, rankedByMargin, rankedByBiz) {
    const bullets = [];
    const budgetRank = rankedByBudget.findIndex(r => r.repId === winner.repId) + 1;
    const marginRank = rankedByMargin.findIndex(r => r.repId === winner.repId) + 1;
    const bizRank    = rankedByBiz.findIndex(r => r.repId === winner.repId) + 1;

    bullets.push({
      icon: '📈',
      text: `#${budgetRank} in % to Budget — ${fmtp(winner.pctToBudget)} (${fmt(winner.totalYtd)} vs ${fmt(winner.budgetYtd)} budget)`,
    });
    bullets.push({
      icon: '🔥',
      text: `#${bizRank} in Weekly New Business — ${fmt(winner.newBizWeek)} this week`,
    });
    bullets.push({
      icon: '💰',
      text: `#${marginRank} in Gross Margin — ${fmtp(winner.marginPct)} margin rate`,
    });
    if (winner.hotStreak) {
      bullets.push({ icon: '🚀', text: 'Hot streak — 3+ consecutive weeks of new business growth' });
    }
    return bullets;
  }

  /* ─────────────────────────────────────────────
     8. ACCOUNTABILITY ANALYSIS
  ───────────────────────────────────────────────── */
  function computeAccountability(filteredDs, thresholds) {
    const reps = filteredDs.repSummaries;
    const threshold = thresholds.yellow; // below this = needs action

    // Reps below budget threshold, sorted worst first
    const repsBelowBudget = sortReps(
      reps.filter(r => r.pctToBudget < threshold && r.budgetYtd > 0),
      'pctToBudget', 'asc'
    );

    // Categories below threshold
    const catsBelowBudget = filteredDs.categorySummaries
      .filter(c => c.pctToBudget < threshold && c.budgetYtd > 0)
      .sort((a, b) => a.pctToBudget - b.pctToBudget);

    // Margin risk: bottom 10% by margin%
    const sortedByMargin = sortReps(reps.filter(r => r.totalYtd > 0), 'marginPct', 'asc');
    const cutoff = Math.max(1, Math.ceil(sortedByMargin.length * 0.10));
    const marginRisk = sortedByMargin.slice(0, cutoff);

    return { repsBelowBudget, catsBelowBudget, marginRisk };
  }

  /* ─────────────────────────────────────────────
     9. STATUS BAR UPDATER
  ───────────────────────────────────────────────── */
  function setStatus(type, message, source) {
    const indicator = $('status-indicator');
    const msgEl     = $('status-message');
    const srcEl     = $('status-source');
    if (indicator) {
      indicator.className = `status-indicator ${type}`;
    }
    if (msgEl)  msgEl.textContent  = message;
    if (srcEl)  srcEl.textContent  = source || '';
  }

  function setTimestamp(isoStr) {
    const d = isoStr ? new Date(isoStr) : new Date();
    const formatted = d.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const el = $('last-updated-ts');
    const fe = $('footer-ts');
    if (el) el.textContent = formatted;
    if (fe) fe.textContent = formatted;
  }

  /* ─────────────────────────────────────────────
     10. FILTER DROPDOWN POPULATION
  ───────────────────────────────────────────────── */
  function populateFilterDropdowns(dataset) {
    // Months
    const monthSel = $('filter-month');
    const whMonthSel = $('workhorse-month');
    if (monthSel) {
      // Remove all but first option
      while (monthSel.options.length > 1) monthSel.remove(1);
      dataset.months.forEach(m => {
        const opt = new Option(formatMonth(m), m);
        monthSel.add(opt);
      });
    }
    if (whMonthSel) {
      whMonthSel.innerHTML = '';
      dataset.months.forEach(m => {
        const opt = new Option(formatMonth(m), m);
        whMonthSel.add(opt);
      });
      // Default to latest month
      if (dataset.months.length) {
        whMonthSel.value = dataset.months[dataset.months.length - 1];
        State.workhorse.month = whMonthSel.value;
      }
    }

    // Weeks
    const weekSel = $('filter-week');
    if (weekSel) {
      while (weekSel.options.length > 1) weekSel.remove(1);
      dataset.weeks.slice().reverse().forEach(w => {
        const opt = new Option(`Week: ${DS.formatDate(w)}`, w);
        weekSel.add(opt);
      });
    }

    // Report period label
    const periodEl = $('report-period');
    if (periodEl && dataset.latestWeek) {
      periodEl.textContent = `Week Ending: ${DS.formatDate(dataset.latestWeek)}`;
    }
    const weekLabelEl = $('kpi-week-label');
    if (weekLabelEl && dataset.latestWeek) {
      weekLabelEl.textContent = `Week Ending: ${DS.formatDate(dataset.latestWeek)}`;
    }
  }

  function formatMonth(m) {
    if (!m) return '—';
    const [y, mo] = m.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(mo,10)-1] || mo} ${y}`;
  }

  /* ─────────────────────────────────────────────
     11. RENDER FUNCTIONS (call UI components)
  ───────────────────────────────────────────────── */

  function renderKPIs(dataset) {
    const g = dataset.global;
    const grid = $('kpi-grid');
    if (!grid) return;

    const monthlySparkData = dataset.monthlyHistory.map(m => m.totalYtd);
    const marginSparkData  = dataset.monthlyHistory.map(m => m.marginPct);
    const pctSparkData     = dataset.monthlyHistory.map(m => m.pctToBudget);

    // Trend vs previous month
    function trendFromHistory(arr) {
      if (arr.length < 2) return 'flat';
      return arr[arr.length-1] > arr[arr.length-2] ? 'up' : 'down';
    }

    grid.innerHTML = '';
    const cards = [
      {
        id:      'kpi-shipped',
        label:   'YTD Shipped',
        value:   fmt(g.shippedYtd),
        trend:   trendFromHistory(dataset.monthlyHistory.map(m=>m.shipped)),
        sub:     `${fmtp(g.shippedYtd / (g.budgetYtd||1))} of budget shipped`,
        spark:   dataset.monthlyHistory.map(m=>m.shipped),
        accent:  'green-accent',
        tooltip: 'Total orders confirmed + shipped year-to-date across all reps and categories.',
      },
      {
        id:      'kpi-open',
        label:   'YTD Open Orders',
        value:   fmt(g.openYtd),
        trend:   trendFromHistory(dataset.monthlyHistory.map(m=>m.open)),
        sub:     `${fmtp(g.openYtd / (g.budgetYtd||1))} of budget open`,
        spark:   dataset.monthlyHistory.map(m=>m.open),
        accent:  'blue-accent',
        tooltip: 'Confirmed orders not yet shipped. Counts toward % to budget.',
      },
      {
        id:      'kpi-total',
        label:   'YTD Total',
        value:   fmt(g.totalYtd),
        trend:   trendFromHistory(monthlySparkData),
        sub:     'Shipped + Open',
        spark:   monthlySparkData,
        accent:  '',
        tooltip: 'YTD Shipped + YTD Open = total committed revenue pipeline.',
      },
      {
        id:      'kpi-budget-pct',
        label:   '% to Budget',
        value:   fmtp(g.pctToBudget),
        trend:   trendFromHistory(pctSparkData),
        sub:     `${fmt(g.totalYtd)} vs ${fmt(g.budgetYtd)} budget`,
        spark:   pctSparkData,
        accent:  thresholdClass(g.pctToBudget) === 'green' ? 'green-accent' :
                 thresholdClass(g.pctToBudget) === 'yellow' ? '' : 'red-accent',
        tooltip: '% to Budget = (Shipped + Open) ÷ Annual Budget.\nThresholds: 🟢≥90% 🟡≥75% 🔴<75%',
        colorClass: thresholdTextClass(g.pctToBudget),
      },
      {
        id:      'kpi-margin-pct',
        label:   'Gross Margin %',
        value:   fmtp(g.marginPct),
        trend:   trendFromHistory(marginSparkData),
        sub:     `${fmt(g.marginDollar)} margin dollars`,
        spark:   marginSparkData,
        accent:  'purple-accent',
        tooltip: 'Gross Margin % = Margin $ ÷ Total Sales.\nLow margin = review pricing + mix.',
      },
      {
        id:      'kpi-margin-dollar',
        label:   'Margin $',
        value:   fmt(g.marginDollar),
        trend:   trendFromHistory(dataset.monthlyHistory.map(m=>m.marginDollar)),
        sub:     'YTD gross margin dollars',
        spark:   dataset.monthlyHistory.map(m=>m.marginDollar),
        accent:  'purple-accent',
        tooltip: 'Total gross margin dollars earned YTD.',
      },
    ];

    cards.forEach(card => {
      const el = UI.createKpiCard(card);
      grid.appendChild(el);
    });
  }

  function renderRegionCompare(dataset) {
    const naEl = $('region-na');
    const euEl = $('region-eu');
    if (!naEl || !euEl) return;

    const na = dataset.regionSummaries.find(r => r.region === 'NA') || {};
    const eu = dataset.regionSummaries.find(r => r.region === 'EU') || {};
    const naReps = dataset.repSummaries.filter(r => r.region === 'NA');
    const euReps = dataset.repSummaries.filter(r => r.region === 'EU');
    const naTop  = naReps.length ? sortReps(naReps, 'pctToBudget','desc')[0] : null;
    const euTop  = euReps.length ? sortReps(euReps, 'pctToBudget','desc')[0] : null;

    naEl.innerHTML = UI.createRegionPanel({
      region: 'NA', flag: '🌎', label: 'NORTH AMERICA',
      total: na.totalYtd || 0, budget: na.budgetYtd || 0,
      pct: na.pctToBudget || 0, margin: na.marginPct || 0,
      newBiz: na.newBizWeek || 0, topRep: naTop,
      thresholds: State.thresholds,
    });
    euEl.innerHTML = UI.createRegionPanel({
      region: 'EU', flag: '🌍', label: 'EUROPE',
      total: eu.totalYtd || 0, budget: eu.budgetYtd || 0,
      pct: eu.pctToBudget || 0, margin: eu.marginPct || 0,
      newBiz: eu.newBizWeek || 0, topRep: euTop,
      thresholds: State.thresholds,
    });

    naEl.classList.remove('skeleton');
    euEl.classList.remove('skeleton');
  }

  function renderBudgetRankings(dataset) {
    const wrap = $('leaderboard-budget');
    if (!wrap) return;
    const { key, dir } = State.sorts.budget;
    const ranked = sortReps(dataset.repSummaries, key, dir);
    const byBudgetOrder = rankByBudget(dataset.repSummaries);

    // Identify "biggest mover" — rep with highest single-jump up from prev sort
    // (heuristic: for now use the rep with highest pct that isn't #1 or #2)
    const biggestMover = byBudgetOrder.length > 3 ? byBudgetOrder[2] : null;

    wrap.innerHTML = UI.createLeaderboardTable({
      rows: ranked.map((rep, i) => {
        const rankInBudget = byBudgetOrder.findIndex(r => r.repId === rep.repId) + 1;
        const badges = [];
        if (rankInBudget === 1) badges.push({ label: '🥇 #1', cls: 'badge-gold' });
        else if (rankInBudget === 2) badges.push({ label: '🥈 #2', cls: 'badge-silver' });
        else if (rankInBudget === 3) badges.push({ label: '🥉 #3', cls: 'badge-bronze' });
        if (biggestMover && rep.repId === biggestMover.repId) badges.push({ label: '📈 Mover', cls: 'badge-mover' });

        return {
          rank: i + 1,
          rep: rep.repName,
          sub: rep.territory,
          cols: [
            { val: rep.region, cls: '' },
            { val: fmt(rep.shippedYtd), cls: 'money-cell' },
            { val: fmt(rep.openYtd),    cls: 'money-cell' },
            { val: fmt(rep.totalYtd),   cls: 'money-cell font-mono fw-bold' },
            { val: rep.budgetYtd > 0 ? fmt(rep.budgetYtd) : '—',  cls: 'money-cell text-muted' },
            {
              val: rep.budgetYtd > 0
                ? UI.createProgressBarHTML({
                    pct: rep.pctToBudget, label: fmtp(rep.pctToBudget),
                    thresholdClass: thresholdClass(rep.pctToBudget),
                  })
                : '<span class="text-muted" style="font-size:12px;padding:2px 0;display:block;">No budget set</span>',
              cls: '', isHtml: true,
            },
          ],
          badges,
          tooltip: `${rep.repName}\nShipped: ${fmt(rep.shippedYtd)}\nOpen: ${fmt(rep.openYtd)}\nBudget: ${fmt(rep.budgetYtd)}\n% to Budget = (Shipped+Open) ÷ Budget`,
        };
      }),
      headers: ['#', 'Rep', 'Region', 'Shipped YTD', 'Open YTD', 'Total', 'Budget', '% to Budget'],
      tableId: 'tbl-budget',
      onSort: (col) => handleSort('budget', col),
    });
  }

  function renderMarginRankings(dataset) {
    const wrap = $('leaderboard-margin');
    if (!wrap) return;
    const { key, dir } = State.sorts.margin;
    const ranked = sortReps(dataset.repSummaries.filter(r => r.totalYtd > 0), key, dir);
    const byMarginOrder = rankByMargin(ranked);

    // Bottom 10% for risk flag
    const cutoff = Math.max(1, Math.ceil(byMarginOrder.length * 0.10));
    const riskIds = new Set(byMarginOrder.slice(-cutoff).map(r => r.repId));

    wrap.innerHTML = UI.createLeaderboardTable({
      rows: ranked.map((rep, i) => {
        const badges = [];
        if (i === 0) badges.push({ label: '🥇 #1', cls: 'badge-gold' });
        if (riskIds.has(rep.repId)) badges.push({ label: '⚠ Risk', cls: 'badge-risk' });

        return {
          rank: i + 1,
          rep: rep.repName,
          sub: rep.territory,
          cols: [
            { val: rep.region, cls: '' },
            { val: fmt(rep.totalYtd), cls: 'money-cell' },
            { val: fmt(rep.marginDollar), cls: 'money-cell' },
            {
              val: UI.createProgressBarHTML({
                pct: rep.marginPct,
                label: fmtp(rep.marginPct),
                thresholdClass: rep.marginPct >= 0.45 ? 'green' : rep.marginPct >= 0.35 ? 'yellow' : 'red',
              }),
              cls: '', isHtml: true,
            },
          ],
          badges,
          tooltip: `${rep.repName}\nTotal: ${fmt(rep.totalYtd)}\nMargin $: ${fmt(rep.marginDollar)}\nMargin % = Margin $ ÷ Total Sales`,
        };
      }),
      headers: ['#', 'Rep', 'Region', 'Total Sales', 'Margin $', 'Margin %'],
      tableId: 'tbl-margin',
      onSort: (col) => handleSort('margin', col),
    });
  }

  function renderNewBizRankings(dataset) {
    const wrap = $('leaderboard-newbiz');
    if (!wrap) return;
    const { key, dir } = State.sorts.newbiz;
    const ranked = sortReps(dataset.repSummaries, key, dir);

    wrap.innerHTML = UI.createLeaderboardTable({
      rows: ranked.map((rep, i) => {
        const badges = [];
        if (i === 0) badges.push({ label: '🥇 #1', cls: 'badge-gold' });
        if (rep.hotStreak) badges.push({ label: '🔥 Hot Streak', cls: 'badge-hot' });

        // 4-week sparkline data
        const wkHistory = rep.weeklyHistory || [];
        const last4 = wkHistory.slice(-4).map(w => w.newBiz);
        while (last4.length < 4) last4.unshift(0);

        return {
          rank: i + 1,
          rep: rep.repName,
          sub: rep.territory,
          cols: [
            { val: rep.region, cls: '' },
            { val: fmt(rep.newBizWeek), cls: 'money-cell fw-bold text-gold' },
            { val: UI.createMiniBarsHTML(last4), cls: '', isHtml: true },
            { val: fmt(rep.newBiz4w || rep.weeklyHistory.reduce((s,w)=>s+w.newBiz,0)), cls: 'money-cell text-muted' },
          ],
          badges,
          tooltip: `${rep.repName}\nThis Week: ${fmt(rep.newBizWeek)}\nHot Streak: 3+ consecutive weeks of new business growth`,
        };
      }),
      headers: ['#', 'Rep', 'Region', 'This Week', '4-Week Trend', '4W Total'],
      tableId: 'tbl-newbiz',
      onSort: (col) => handleSort('newbiz', col),
    });
  }

  function renderCategories(dataset) {
    ['sticks', 'skates', 'goalie'].forEach(cat => {
      const catSum  = dataset.categorySummaries.find(c => c.category === cat) || {};
      const catNA   = dataset.categoryRegionSummaries.find(c => c.category===cat && c.region==='NA') || {};
      const catEU   = dataset.categoryRegionSummaries.find(c => c.category===cat && c.region==='EU') || {};
      const top5    = topRepsByCategory(dataset, cat);

      const kpiEl   = $(`cat-${cat}-kpis`);
      const barEl   = $(`cat-${cat}-bar`);
      const top5El  = $(`cat-${cat}-top5`);
      if (!kpiEl) return;

      kpiEl.innerHTML = `
        <div class="cat-kpi-item">
          <div class="cat-kpi-val">${fmt(catSum.totalYtd||0)}</div>
          <div class="cat-kpi-lbl">YTD Total</div>
        </div>
        <div class="cat-kpi-item">
          <div class="cat-kpi-val ${thresholdTextClass(catSum.pctToBudget||0)}">${fmtp(catSum.pctToBudget||0)}</div>
          <div class="cat-kpi-lbl">% to Budget</div>
        </div>
        <div class="cat-kpi-item">
          <div class="cat-kpi-val">${fmt(catSum.shippedYtd||0)}</div>
          <div class="cat-kpi-lbl">Shipped</div>
        </div>
        <div class="cat-kpi-item">
          <div class="cat-kpi-val ${fmtp(catSum.marginPct||0).includes('NaN')?'':thresholdTextClass((catSum.marginPct||0))}">${fmtp(catSum.marginPct||0)}</div>
          <div class="cat-kpi-lbl">Margin %</div>
        </div>
      `;

      const naTotal  = catNA.totalYtd || 0;
      const euTotal  = catEU.totalYtd || 0;
      const grandTotal = naTotal + euTotal || 1;
      const naPct = naTotal / grandTotal;
      const euPct = euTotal / grandTotal;
      if (barEl) barEl.innerHTML = UI.createCategoryStackBarHTML({ naPct, euPct, naTotal, euTotal });

      if (top5El) {
        top5El.innerHTML = `<div class="cat-top5-title">Top Reps — % to Budget</div>` +
          top5.map((rep, i) => `
            <div class="cat-top5-row">
              <span class="cat-rank">${['🥇','🥈','🥉','4','5'][i]}</span>
              <span class="cat-rep">${rep.repName}</span>
              <span class="cat-pct ${thresholdTextClass(rep.pctToBudget)}">${fmtp(rep.pctToBudget)}</span>
            </div>
          `).join('');
      }
    });
  }

  function renderWorkHorse(dataset) {
    const wrap = $('workhorse-wrap');
    if (!wrap) return;

    // Filter to selected month
    const selMonth = State.workhorse.month;
    let reps = dataset.repSummaries;
    if (selMonth) {
      /* Re-aggregate from transactional rows filtered to this month */
      const monthRows = dataset.rows.filter(r => r.month === selMonth);
      const budgets   = DS.getBudgets ? DS.getBudgets() : {};
      const byRep     = new Map();
      monthRows.forEach(r => {
        const k = r.repName;
        if (!byRep.has(k)) byRep.set(k, {
          repId: r.repName.toLowerCase().replace(/\s+/g, '_'),
          repName: r.repName, territory: r.territory, region: r.region,
          shippedYtd: 0, openYtd: 0, totalYtd: 0,
          budgetYtd: budgets[r.repName] || 0,
          marginDollar: 0, newBizWeek: 0,
          pctToBudget: 0, marginPct: 0,
        });
        const cur = byRep.get(k);
        if (r.isShipped) cur.shippedYtd += r.salesAmt;
        else             cur.openYtd    += r.salesAmt;
        cur.totalYtd    = cur.shippedYtd + cur.openYtd;
        cur.marginDollar += r.profit;
        /* Count this week's sales as "new biz" for the month view */
        if (dataset.currentWeek && r.weekStart === dataset.currentWeek) {
          cur.newBizWeek += r.salesAmt;
        }
        cur.pctToBudget = cur.budgetYtd > 0 ? cur.totalYtd / cur.budgetYtd : 0;
        cur.marginPct   = cur.totalYtd > 0 ? cur.marginDollar / cur.totalYtd : 0;
      });
      reps = [...byRep.values()].filter(r => r.repName);
    }

    if (!reps.length) {
      wrap.innerHTML = `<p class="text-muted" style="padding:2rem;">No data for selected month.</p>`;
      return;
    }

    const scored = computeWorkHorseScores(reps);
    const winner = scored[0];
    const runners = scored.slice(1, 4);
    const byBudget = rankByBudget(reps);
    const byMargin = rankByMargin(reps);
    const byBiz    = rankByNewBiz(reps);
    const bullets  = buildWhyBullets(winner, byBudget, byMargin, byBiz);

    wrap.innerHTML = UI.createWorkHorseCardHTML({
      winner, runners, bullets,
      month: selMonth ? formatMonth(selMonth) : 'YTD',
    });
  }

  function renderAccountability(dataset) {
    const { repsBelowBudget, catsBelowBudget, marginRisk } = computeAccountability(dataset, State.thresholds);
    const total = repsBelowBudget.length + catsBelowBudget.length + marginRisk.length;

    const countEl = $('accountability-count');
    if (countEl) countEl.textContent = `${total} item${total !== 1 ? 's' : ''} need attention`;

    // Reps below budget
    const repBody = $('acct-reps-budget-body');
    if (repBody) {
      if (!repsBelowBudget.length) {
        repBody.innerHTML = `<div class="acct-empty">✅ All reps above threshold</div>`;
      } else {
        repBody.innerHTML = repsBelowBudget.map(r => `
          <div class="acct-row">
            <div>
              <div class="acct-row-label">${r.repName}</div>
              <div class="acct-row-sub">${r.territory} — ${r.region}</div>
            </div>
            <span class="acct-row-val ${thresholdTextClass(r.pctToBudget)}"
              data-tooltip="${r.repName} — ${fmtp(r.pctToBudget)} to budget. Gap: ${fmt(r.budgetYtd - r.totalYtd)}">
              ${fmtp(r.pctToBudget)}
            </span>
          </div>
        `).join('');
      }
    }

    // Categories below budget
    const catBody = $('acct-category-budget-body');
    if (catBody) {
      if (!catsBelowBudget.length) {
        catBody.innerHTML = `<div class="acct-empty">✅ All categories above threshold</div>`;
      } else {
        catBody.innerHTML = catsBelowBudget.map(c => `
          <div class="acct-row">
            <div>
              <div class="acct-row-label">${c.category.toUpperCase()}</div>
              <div class="acct-row-sub">Gap: ${fmt(c.budgetYtd - c.totalYtd)}</div>
            </div>
            <span class="acct-row-val ${thresholdTextClass(c.pctToBudget)}">
              ${fmtp(c.pctToBudget)}
            </span>
          </div>
        `).join('');
      }
    }

    // Margin risk
    const mrgBody = $('acct-margin-risk-body');
    if (mrgBody) {
      if (!marginRisk.length) {
        mrgBody.innerHTML = `<div class="acct-empty">✅ No margin risk flags</div>`;
      } else {
        mrgBody.innerHTML = marginRisk.map(r => `
          <div class="acct-row">
            <div>
              <div class="acct-row-label">${r.repName}</div>
              <div class="acct-row-sub">${r.territory}</div>
            </div>
            <span class="acct-row-val red"
              data-tooltip="Gross Margin: ${fmtp(r.marginPct)} — bottom 10% of team. Review pricing and product mix.">
              ${fmtp(r.marginPct)} GM
            </span>
          </div>
        `).join('');
      }
    }
  }

  /* ─────────────────────────────────────────────
     12. MASTER RENDER
  ───────────────────────────────────────────────── */
  function renderAll() {
    const ds = State.filtered || State.dataset;
    if (!ds) return;
    renderKPIs(ds);
    renderRegionCompare(ds);
    renderBudgetRankings(ds);
    renderMarginRankings(ds);
    renderNewBizRankings(ds);
    renderCategories(ds);
    renderWorkHorse(State.dataset); // Always use full dataset for WH (month-filtered separately)
    renderAccountability(ds);
    bindTooltips();
  }

  /* ─────────────────────────────────────────────
     13. SORTING HANDLER
  ───────────────────────────────────────────────── */
  function handleSort(table, col) {
    const keyMap = {
      budget: { 'pct-budget': 'pctToBudget', 'total': 'totalYtd', 'shipped': 'shippedYtd' },
      margin: { 'margin-pct': 'marginPct', 'margin-dollar': 'marginDollar' },
      newbiz: { 'week-new': 'newBizWeek', '4w-new': 'newBiz4w' },
    };
    const key = keyMap[table]?.[col];
    if (!key) return;
    const s = State.sorts[table];
    if (s.key === key) s.dir = s.dir === 'desc' ? 'asc' : 'desc';
    else { s.key = key; s.dir = 'desc'; }

    if (table === 'budget') renderBudgetRankings(State.filtered || State.dataset);
    if (table === 'margin') renderMarginRankings(State.filtered || State.dataset);
    if (table === 'newbiz') renderNewBizRankings(State.filtered || State.dataset);
  }

  /* ─────────────────────────────────────────────
     14. FILTER HANDLER
  ───────────────────────────────────────────────── */
  function applyFilters() {
    if (!State.dataset) return;
    const { region, month, category } = State.filters;
    State.filtered = DS.filterDataset(State.dataset, { region, month, category });
    renderAll();
  }

  /* ─────────────────────────────────────────────
     15. DATA LOAD + REFRESH
  ───────────────────────────────────────────────── */
  async function loadData(file = null) {
    setStatus('warn', 'Loading data…');
    $('error-banner').style.display = 'none';

    try {
      const result = await DS.load({
        mode: State.mode,
        url:  State.csvUrl,
        file: file || State.activeFile,
      });
      State.dataset = result.dataset;
      State.filtered = null;
      State.filters = { region: 'all', month: 'all', category: 'all', week: 'latest' };

      populateFilterDropdowns(result.dataset);
      renderAll();
      setStatus('ok', result.fromCache ? 'Showing cached data' : 'Data loaded successfully', result.sourceLabel);
      setTimestamp(result.timestamp);

      const footSrc = $('footer-source');
      if (footSrc) footSrc.textContent = result.sourceLabel || '—';

      const footCache = $('footer-cache-note');
      if (footCache) footCache.textContent = result.fromCache ? '(from cache)' : '';

    } catch (err) {
      console.error('[Dashboard] Load error:', err);
      setStatus('error', `Error: ${err.message}`);
      $('error-banner').style.display = 'flex';
      $('error-text').textContent = err.message;
    }
  }

  /* ─────────────────────────────────────────────
     16. CONFIG PANEL LOGIC
  ───────────────────────────────────────────────── */
  function openConfig() {
    State.configOpen = true;
    $('config-panel').classList.add('open');
    $('config-overlay').classList.add('visible');
    $('config-panel').setAttribute('aria-hidden', 'false');
  }

  function closeConfig() {
    State.configOpen = false;
    $('config-panel').classList.remove('open');
    $('config-overlay').classList.remove('visible');
    $('config-panel').setAttribute('aria-hidden', 'true');
  }

  function syncConfigUI() {
    const isUrl  = State.mode === 'url';
    const urlSec  = $('config-url-section');
    const fileSec = $('config-file-section');
    if (urlSec)  urlSec.style.display  = isUrl ? 'block' : 'none';
    if (fileSec) fileSec.style.display = isUrl ? 'none'  : 'block';

    // Show file info if cached
    if (!isUrl && DS.hasCache()) {
      const info = DS.getCacheInfo();
      const infoEl = $('loaded-file-info');
      const nameEl = $('loaded-file-name');
      if (infoEl) infoEl.style.display = 'flex';
      if (nameEl) nameEl.textContent = info.source || 'Cached file';
      const dz = $('drop-zone');
      if (dz) dz.style.display = 'none';
    }
  }

  function saveConfig() {
    State.mode   = $('mode-url').checked ? 'url' : 'file';
    State.csvUrl = ($('csv-url-input').value || '').trim();
    State.currency = $('currency-select').value;
    State.thresholds.red    = parseFloat($('threshold-red').value)    / 100 || 0.75;
    State.thresholds.yellow = parseFloat($('threshold-yellow').value) / 100 || 0.90;
    closeConfig();
    loadData();
  }

  /* ─────────────────────────────────────────────
     17. TOOLTIP ENGINE
  ───────────────────────────────────────────────── */
  function bindTooltips() {
    const box = $('tooltip-box');
    if (!box) return;

    function show(e) {
      const tip = e.currentTarget.dataset.tooltip;
      if (!tip) return;
      box.textContent = tip;
      box.classList.add('visible');
      positionTooltip(e);
    }
    function hide() { box.classList.remove('visible'); }
    function move(e) { positionTooltip(e); }

    function positionTooltip(e) {
      const x = e.clientX + 14;
      const y = e.clientY + 14;
      const bw = box.offsetWidth;
      const bh = box.offsetHeight;
      const ww = window.innerWidth;
      const wh = window.innerHeight;
      box.style.left = Math.min(x, ww - bw - 12) + 'px';
      box.style.top  = Math.min(y, wh - bh - 12) + 'px';
    }

    $$('[data-tooltip]').forEach(el => {
      el.removeEventListener('mouseenter', el._tipEnter);
      el.removeEventListener('mouseleave', el._tipLeave);
      el.removeEventListener('mousemove',  el._tipMove);
      el._tipEnter = show;
      el._tipLeave = hide;
      el._tipMove  = move;
      el.addEventListener('mouseenter', show);
      el.addEventListener('mouseleave', hide);
      el.addEventListener('mousemove',  move);
    });
  }

  /* ─────────────────────────────────────────────
     18. EVENT WIRING
  ───────────────────────────────────────────────── */
  function wireEvents() {

    /* Config toggle */
    $('btn-config-toggle').addEventListener('click', openConfig);
    $('btn-config-close').addEventListener('click', closeConfig);
    $('config-overlay').addEventListener('click', closeConfig);
    $('btn-save-config').addEventListener('click', saveConfig);

    /* Refresh button */
    $('btn-refresh').addEventListener('click', () => loadData());
    $('btn-retry').addEventListener('click',   () => loadData());

    /* Mode radio change */
    $$('[name="data-mode"]').forEach(radio => {
      radio.addEventListener('change', () => {
        State.mode = $('mode-url').checked ? 'url' : 'file';
        syncConfigUI();
      });
    });

    /* File upload — drop zone */
    const dropZone  = $('drop-zone');
    const fileInput = $('csv-file-input');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f) handleFileSelect(f);
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
    });

    /* Replace CSV button */
    $('btn-replace-csv').addEventListener('click', () => {
      DS.clearCache();
      $('loaded-file-info').style.display = 'none';
      $('drop-zone').style.display = '';
      fileInput.value = '';
      State.activeFile = null;
    });

    /* Clear cache */
    $('btn-clear-cache').addEventListener('click', () => {
      DS.clearCache();
      State.activeFile = null;
      alert('Cache cleared. Please upload or re-fetch data.');
      syncConfigUI();
    });

    /* Budget save */
    const budgetBtn = $('btn-save-budgets');
    if (budgetBtn) {
      budgetBtn.addEventListener('click', () => {
        const text   = ($('budget-textarea') || {}).value || '';
        const parsed = DS.parseBudgetText(text);
        DS.saveBudgets(parsed);
        const msg = $('budget-saved-msg');
        if (msg) {
          msg.style.display = 'inline';
          setTimeout(() => { msg.style.display = 'none'; }, 2000);
        }
        /* Reload so budget changes take effect in rankings */
        loadData();
      });
    }

    /* Download template */
    $('btn-download-template').addEventListener('click', () => {
      const csv = DS.generateTemplate();
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'sales_dashboard_template.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    /* Filter changes */
    ['filter-region','filter-month','filter-category','filter-week'].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('change', () => {
        State.filters.region   = $('filter-region').value;
        State.filters.month    = $('filter-month').value;
        State.filters.category = $('filter-category').value;
        applyFilters();
      });
    });

    /* Reset filters */
    $('btn-reset-filters').addEventListener('click', () => {
      $('filter-region').value   = 'all';
      $('filter-month').value    = 'all';
      $('filter-category').value = 'all';
      $('filter-week').value     = 'latest';
      State.filters = { region: 'all', month: 'all', category: 'all', week: 'latest' };
      State.filtered = null;
      renderAll();
    });

    /* Sort buttons */
    $$('.sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const table = btn.dataset.table;
        const sort  = btn.dataset.sort;
        $$(`[data-table="${table}"]`).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        handleSort(table, sort);
      });
    });

    /* Workhorse month selector */
    $('workhorse-month').addEventListener('change', e => {
      State.workhorse.month = e.target.value;
      renderWorkHorse(State.dataset);
    });
  }

  function handleFileSelect(file) {
    State.activeFile = file;
    const nameEl = $('loaded-file-name');
    const infoEl = $('loaded-file-info');
    const dz     = $('drop-zone');
    if (nameEl) nameEl.textContent = file.name;
    if (infoEl) infoEl.style.display = 'flex';
    if (dz)     dz.style.display     = 'none';
    loadData(file);
    closeConfig();
  }

  /* ─────────────────────────────────────────────
     19. INIT
  ───────────────────────────────────────────────── */
  function init() {
    wireEvents();
    syncConfigUI();

    // Restore config from localStorage if previously saved
    const savedMode = localStorage.getItem('trueSports_mode');
    const savedUrl  = localStorage.getItem('trueSports_url');
    const savedCurr = localStorage.getItem('trueSports_currency');
    if (savedMode) { State.mode = savedMode; }
    if (savedUrl)  { State.csvUrl = savedUrl; $('csv-url-input').value = savedUrl; }
    if (savedCurr) { State.currency = savedCurr; }

    /* Restore budgets into textarea */
    const budgetTextarea = $('budget-textarea');
    if (budgetTextarea && DS.getBudgets) {
      const saved = DS.getBudgets();
      if (Object.keys(saved).length) {
        budgetTextarea.value = DS.budgetsToText(saved);
      }
    }

    if (State.mode === 'url') $('mode-url').checked = true;
    else $('mode-file').checked = true;
    syncConfigUI();

    // Try to load data (will use cache if available)
    loadData();
  }

  // Kick off once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.Dashboard = { loadData, renderAll, applyFilters };

}(window));
