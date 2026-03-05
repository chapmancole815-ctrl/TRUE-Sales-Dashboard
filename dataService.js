/* ═══════════════════════════════════════════════════════════════
   TRUE SPORTS — SALES DASHBOARD  |  dataService.js  v2.0
   Data layer for True Sports ERP transactional export.
   No DOM manipulation — pure data in, clean dataset out.
   ═══════════════════════════════════════════════════════════════

   TRUE SPORTS CSV COLUMNS (Oracle ERP export):
     SALESREP_NAME       — rep full name
     TERRITORY_NAME      — rep territory label
     REGION              — customer market: CAN / USA / EUR / ROW / JP / KOR / RUS
     PRODUCT_TYPE        — category: STICKS / SKATES - CUSTOM / SKATES - STOCK /
                           SKATES - OTHER / GOALIE - CUSTOM / GOALIE - STOCK /
                           PROTECTIVE / APPAREL / BAGS / OTHER
     Sales               — USD revenue for this order line
     OPEN_FLAG           — "Shipped Only" | "Open Only"
     PROFIT              — USD profit for this order line
     MARGIN%             — margin % string, e.g. "62%"
     CREATION_DATE       — order creation timestamp, e.g. "2/20/2026 9:00"
     PERIOD_NAME         — fiscal period label, e.g. "26-Feb" (FY2026 February)
     WEEK_OF_YEAR        — integer week number

   BUDGET: not in CSV — stored in localStorage as JSON:
     trueSports_budgets = { "Rep Name": annualBudget, ... }
   Use the Config panel ⚙ → Rep Budgets to enter these values.
   ═══════════════════════════════════════════════════════════════ */

'use strict';

(function (window) {

  /* ─────────────────────────────────────────────
     1. CONSTANTS
  ───────────────────────────────────────────────── */
  const DS_CACHE_KEY   = 'trueSports_csvCache';
  const DS_TS_KEY      = 'trueSports_lastUpdated';
  const DS_SOURCE_KEY  = 'trueSports_dataSource';
  const DS_BUDGET_KEY  = 'trueSports_budgets';

  /* REGION column value → NA / EU / Other */
  const REGION_MAP = {
    CAN: 'NA', USA: 'NA', ROW: 'NA',
    EUR: 'EU',
    JP: 'Other', KOR: 'Other', RUS: 'Other',
  };

  /* Normalize PRODUCT_TYPE → canonical category */
  function normCategory(raw) {
    if (!raw) return 'other';
    const s = raw.toUpperCase().replace(/\s*-\s*/g, '-').trim();
    if (s === 'STICKS')                return 'sticks';
    if (s.startsWith('SKATES'))        return 'skates';
    if (s.startsWith('GOALIE'))        return 'goalie';
    if (s === 'PROTECTIVE')            return 'protective';
    if (s === 'APPAREL')               return 'apparel';
    if (s === 'BAGS')                  return 'bags';
    return 'other';
  }

  function normRegion(raw) {
    if (!raw) return 'NA';
    return REGION_MAP[raw.trim().toUpperCase()] || 'Other';
  }

  /* ─────────────────────────────────────────────
     2. TYPE HELPERS
  ───────────────────────────────────────────────── */
  function num(v) {
    if (v === null || v === undefined || v === '') return 0;
    const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function pct(v) {
    if (v === null || v === undefined || v === '') return 0;
    const s = String(v).trim();
    const hasPctSign = s.endsWith('%');
    const n = parseFloat(s.replace(/[%,\s$]/g, ''));
    if (isNaN(n)) return 0;
    return (hasPctSign || Math.abs(n) > 2) ? n / 100 : n;
  }

  /* Parse "M/D/YYYY H:MM" or ISO → Date */
  function parseDate(str) {
    if (!str) return null;
    str = String(str).trim();
    const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mdy) return new Date(+mdy[3], +mdy[1] - 1, +mdy[2]);
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return new Date(str.slice(0, 10));
    return null;
  }

  /* Parse "26-Feb" → "2026-02" */
  const MONTH_ABBR = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
  };
  function parsePeriod(str) {
    if (!str) return '';
    str = String(str).trim();
    const m = str.match(/^(\d{2})-([A-Za-z]{3})$/);
    if (m) return `20${m[1]}-${MONTH_ABBR[m[2].toUpperCase()] || '01'}`;
    if (/^\d{4}-\d{2}$/.test(str)) return str;
    return '';
  }

  /* Sunday-start week key from a Date → "YYYY-MM-DD" */
  function weekKey(date) {
    if (!date) return '';
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay()); // back to Sunday
    return d.toISOString().slice(0, 10);
  }

  /* ─────────────────────────────────────────────
     3. CSV PARSER — handles BOM, CRLF, quoted fields
  ───────────────────────────────────────────────── */
  function parseCSV(csvText) {
    const text = csvText.replace(/^\uFEFF/, '').trim();
    if (!text) return [];

    const rows = [];
    let row = [], field = '', inQuotes = false, i = 0;

    while (i < text.length) {
      const ch  = text[i];
      const nch = text[i + 1];

      if (inQuotes) {
        if (ch === '"') {
          if (nch === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += ch; i++; continue;
      }

      if (ch === '"')                  { inQuotes = true; i++; continue; }
      if (ch === ',')                  { row.push(field); field = ''; i++; continue; }
      if (ch === '\r' && nch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 2; continue; }
      if (ch === '\n' || ch === '\r')  { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += ch; i++;
    }
    row.push(field);
    if (row.some(f => f !== '')) rows.push(row);
    if (rows.length < 2) return [];

    /* Normalize headers + deduplicate (UNIT_LIST_PRICE appears twice in ERP export) */
    const seen = {};
    const headers = rows[0].map(h => {
      const base = h.toLowerCase().trim()
        .replace(/[%]+/g, '_pct')
        .replace(/[\s]+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
      seen[base] = (seen[base] || 0) + 1;
      return seen[base] > 1 ? `${base}_${seen[base]}` : base;
    });

    return rows.slice(1).map(cols => {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = cols[idx] !== undefined ? cols[idx].trim() : ''; });
      return obj;
    }).filter(obj => Object.values(obj).some(v => v !== ''));
  }

  /* ─────────────────────────────────────────────
     4. ROW NORMALIZER — True Sports ERP format
     Returns null for rows to skip (no-credit, blank).
  ───────────────────────────────────────────────── */
  const SKIP_REPS = new Set(['no sales credit', 'no rep', 'n/a', '']);

  function normalizeRow(raw) {
    const repName = (raw.salesrep_name || '').trim();
    if (SKIP_REPS.has(repName.toLowerCase())) return null;

    const salesAmt = num(raw.sales);
    const isShipped = (raw.open_flag || '').toLowerCase().includes('ship');
    const profit    = num(raw.profit);
    // MARGIN% normalized header becomes margin_pct (our custom transform above)
    const marginPct = pct(raw.margin_pct || raw.margin_);
    const creDate   = parseDate(raw.creation_date);
    const month     = parsePeriod(raw.period_name);
    const wk        = creDate ? weekKey(creDate) : '';
    const weekNum   = parseInt(raw.week_of_year, 10) || 0;

    return {
      repName,
      territory:    (raw.territory_name || '').trim(),
      region:       normRegion(raw.region),
      category:     normCategory(raw.product_type),
      salesAmt,
      isShipped,
      profit,
      marginPct,
      creationDate: creDate,
      month,
      weekStart:    wk,
      weekOfYear:   weekNum,
    };
  }

  /* ─────────────────────────────────────────────
     5. BUDGET STORE
  ───────────────────────────────────────────────── */
  const Budget = {
    load() {
      try { return JSON.parse(localStorage.getItem(DS_BUDGET_KEY) || '{}'); }
      catch { return {}; }
    },
    save(obj) {
      try { localStorage.setItem(DS_BUDGET_KEY, JSON.stringify(obj)); }
      catch (e) { console.warn('[DS] Budget save failed:', e.message); }
    },
    /* Parse a textarea string: "Rep Name, 400000\nRep 2, 350000" */
    parseText(text) {
      const budgets = {};
      (text || '').split('\n').forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        const comma = line.lastIndexOf(',');
        if (comma === -1) return;
        const name = line.slice(0, comma).trim();
        const val  = parseFloat(line.slice(comma + 1).replace(/[$,\s]/g, ''));
        if (name && !isNaN(val)) budgets[name] = val;
      });
      return budgets;
    },
    /* Serialize to textarea format */
    toText(obj) {
      return Object.entries(obj)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, val]) => `${name}, ${val}`)
        .join('\n');
    },
  };

  /* ─────────────────────────────────────────────
     6. AGGREGATION HELPERS
  ───────────────────────────────────────────────── */
  function groupBy(rows, keyFn) {
    const map = new Map();
    rows.forEach(r => {
      const k = keyFn(r);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    });
    return map;
  }

  /* Detect the "current week" — week containing the latest CREATION_DATE */
  function detectCurrentWeek(rows) {
    let maxDate = null;
    rows.forEach(r => {
      if (r.creationDate && (!maxDate || r.creationDate > maxDate)) maxDate = r.creationDate;
    });
    return maxDate ? weekKey(maxDate) : '';
  }

  /* Aggregate transaction rows for one rep into a summary object */
  function aggregateRep(repName, rows, budgets, currentWeek) {
    /* Territory: first non-empty value */
    const territory = (rows.find(r => r.territory) || {}).territory || '';

    /* Region: most common among this rep's transactions */
    const regCount = {};
    rows.forEach(r => { regCount[r.region] = (regCount[r.region] || 0) + 1; });
    const region = Object.entries(regCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'NA';

    const shipped = rows.filter(r =>  r.isShipped).reduce((s, r) => s + r.salesAmt, 0);
    const open    = rows.filter(r => !r.isShipped).reduce((s, r) => s + r.salesAmt, 0);
    const total   = shipped + open;
    const profit  = rows.reduce((s, r) => s + r.profit, 0);
    const marginPct = total > 0 ? profit / total : 0;

    const budget  = (budgets && budgets[repName]) || 0;
    const pctToBudget = budget > 0 ? total / budget : 0;

    /* Weekly new business = sales in the "current week" by CREATION_DATE */
    const newBizWeek = currentWeek
      ? rows.filter(r => r.weekStart === currentWeek).reduce((s, r) => s + r.salesAmt, 0)
      : 0;

    /* Weekly history for sparklines — group by weekStart */
    const byWeek = groupBy(rows, r => r.weekStart);
    const weeklyHistory = [...byWeek.entries()]
      .filter(([wk]) => wk)
      .map(([wk, wrows]) => ({
        weekStart: wk,
        newBiz:    wrows.reduce((s, r) => s + r.salesAmt, 0),
      }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

    const newBiz4w = weeklyHistory.slice(-4).reduce((s, w) => s + w.newBiz, 0);

    /* Hot streak: 3+ consecutive weeks of increasing sales */
    const hotStreak = weeklyHistory.length >= 3 &&
      weeklyHistory.at(-2).newBiz > weeklyHistory.at(-3).newBiz &&
      weeklyHistory.at(-1).newBiz > weeklyHistory.at(-2).newBiz;

    return {
      repId:        repName.toLowerCase().replace(/\s+/g, '_'),
      repName,
      territory,
      region,
      shippedYtd:   shipped,
      openYtd:      open,
      budgetYtd:    budget,
      totalYtd:     total,
      pctToBudget,
      marginDollar: profit,
      marginPct,
      newBizWeek,
      newBiz4w,
      weeklyHistory,
      hotStreak,
    };
  }

  /* ─────────────────────────────────────────────
     7. BUILD DATASET — main aggregation pipeline
  ───────────────────────────────────────────────── */
  function buildDataset(rawRows, budgetOverride) {
    const rows = rawRows.map(normalizeRow).filter(Boolean);
    if (!rows.length) throw new Error('No valid data rows after parsing. Check CSV format.');

    const budgets     = budgetOverride || Budget.load();
    const currentWeek = detectCurrentWeek(rows);

    /* Unique months + week keys for filter dropdowns */
    const months = [...new Set(rows.map(r => r.month).filter(Boolean))].sort();
    const weeks  = [...new Set(rows.map(r => r.weekStart).filter(Boolean))].sort();
    const latestWeek = weeks[weeks.length - 1] || '';

    /* ── Rep summaries (all categories combined) ── */
    const byRep = groupBy(rows, r => r.repName);
    const repSummaries = [...byRep.entries()]
      .map(([repName, repRows]) => aggregateRep(repName, repRows, budgets, currentWeek))
      .filter(r => r.repName)
      .sort((a, b) => b.totalYtd - a.totalYtd);

    /* ── Category × Region summaries ── */
    const byCatReg = groupBy(rows, r => `${r.category}__${r.region}`);
    const categoryRegionSummaries = [...byCatReg.entries()].map(([key, crows]) => {
      const [category, region] = key.split('__');
      const sh = crows.filter(r =>  r.isShipped).reduce((s, r) => s + r.salesAmt, 0);
      const op = crows.filter(r => !r.isShipped).reduce((s, r) => s + r.salesAmt, 0);
      const tt = sh + op;
      const pr = crows.reduce((s, r) => s + r.profit, 0);
      return {
        category, region,
        shippedYtd: sh, openYtd: op, budgetYtd: 0,
        totalYtd: tt, pctToBudget: 0,
        marginDollar: pr, marginPct: tt > 0 ? pr / tt : 0,
      };
    });

    /* ── Category summaries (all regions) ── */
    const byCat = groupBy(rows, r => r.category);
    const categorySummaries = [...byCat.entries()].map(([category, crows]) => {
      const sh = crows.filter(r =>  r.isShipped).reduce((s, r) => s + r.salesAmt, 0);
      const op = crows.filter(r => !r.isShipped).reduce((s, r) => s + r.salesAmt, 0);
      const tt = sh + op;
      const pr = crows.reduce((s, r) => s + r.profit, 0);
      return {
        category,
        shippedYtd: sh, openYtd: op, budgetYtd: 0,
        totalYtd: tt, pctToBudget: 0,
        marginDollar: pr, marginPct: tt > 0 ? pr / tt : 0,
      };
    });

    /* ── Region summaries ── */
    const byReg = groupBy(rows, r => r.region);
    const regionSummaries = [...byReg.entries()].map(([region, rrows]) => {
      const sh = rrows.filter(r =>  r.isShipped).reduce((s, r) => s + r.salesAmt, 0);
      const op = rrows.filter(r => !r.isShipped).reduce((s, r) => s + r.salesAmt, 0);
      const tt = sh + op;
      const pr = rrows.reduce((s, r) => s + r.profit, 0);
      /* Budget for region = sum of rep budgets whose primary region = this region */
      const bg = repSummaries.filter(r => r.region === region).reduce((s, r) => s + r.budgetYtd, 0);
      const wkRows = currentWeek ? rrows.filter(r => r.weekStart === currentWeek) : [];
      return {
        region,
        shippedYtd: sh, openYtd: op, budgetYtd: bg,
        totalYtd: tt, pctToBudget: bg > 0 ? tt / bg : 0,
        marginDollar: pr, marginPct: tt > 0 ? pr / tt : 0,
        newBizWeek: wkRows.reduce((s, r) => s + r.salesAmt, 0),
      };
    });

    /* ── Global KPIs ── */
    const gSh = rows.filter(r =>  r.isShipped).reduce((s, r) => s + r.salesAmt, 0);
    const gOp = rows.filter(r => !r.isShipped).reduce((s, r) => s + r.salesAmt, 0);
    const gTt = gSh + gOp;
    const gPr = rows.reduce((s, r) => s + r.profit, 0);
    const gBg = repSummaries.reduce((s, r) => s + r.budgetYtd, 0);
    const gWk = currentWeek
      ? rows.filter(r => r.weekStart === currentWeek).reduce((s, r) => s + r.salesAmt, 0)
      : 0;

    /* ── Monthly history for sparklines ── */
    const monthlyHistory = months.map(m => {
      const mrows = rows.filter(r => r.month === m);
      const sh = mrows.filter(r =>  r.isShipped).reduce((s, r) => s + r.salesAmt, 0);
      const op = mrows.filter(r => !r.isShipped).reduce((s, r) => s + r.salesAmt, 0);
      const tt = sh + op;
      const pr = mrows.reduce((s, r) => s + r.profit, 0);
      return {
        month: m, shipped: sh, open: op, budget: 0, total: tt,
        pctToBudget: 0, marginDollar: pr, marginPct: tt > 0 ? pr / tt : 0,
      };
    });

    /* ── Rep weekly map (kept for compat with dashboard.js) ── */
    const repWeeklyMap = {};
    repSummaries.forEach(r => { repWeeklyMap[r.repId] = r.weeklyHistory; });

    return {
      rows,
      months,
      weeks,
      latestWeek,
      currentWeek,
      repSummaries,
      categoryRegionSummaries,
      categorySummaries,
      regionSummaries,
      repWeeklyMap,
      monthlyHistory,
      global: {
        shippedYtd:   gSh,
        openYtd:      gOp,
        budgetYtd:    gBg,
        totalYtd:     gTt,
        pctToBudget:  gBg > 0 ? gTt / gBg : 0,
        marginDollar: gPr,
        marginPct:    gTt > 0 ? gPr / gTt : 0,
        newBizWeek:   gWk,
      },
    };
  }

  /* ─────────────────────────────────────────────
     8. FILTER HELPER — re-aggregates on filtered rows
  ───────────────────────────────────────────────── */
  function filterDataset(dataset, { region = 'all', month = 'all', category = 'all' } = {}) {
    let rows = dataset.rows;
    if (region   !== 'all') rows = rows.filter(r => r.region   === region);
    if (month    !== 'all') rows = rows.filter(r => r.month    === month);
    if (category !== 'all') rows = rows.filter(r => r.category === category);

    const budgets     = Budget.load();
    const currentWeek = dataset.currentWeek;

    const byRep = groupBy(rows, r => r.repName);
    const repSummaries = [...byRep.entries()]
      .map(([repName, repRows]) => aggregateRep(repName, repRows, budgets, currentWeek))
      .filter(r => r.repName)
      .sort((a, b) => b.totalYtd - a.totalYtd);

    const byCat = groupBy(rows, r => r.category);
    const categorySummaries = [...byCat.entries()].map(([cat, crows]) => {
      const sh = crows.filter(r =>  r.isShipped).reduce((s, r) => s + r.salesAmt, 0);
      const op = crows.filter(r => !r.isShipped).reduce((s, r) => s + r.salesAmt, 0);
      const tt = sh + op;
      const pr = crows.reduce((s, r) => s + r.profit, 0);
      return {
        category: cat, shippedYtd: sh, openYtd: op, budgetYtd: 0,
        totalYtd: tt, pctToBudget: 0,
        marginDollar: pr, marginPct: tt > 0 ? pr / tt : 0,
      };
    });

    const byReg = groupBy(rows, r => r.region);
    const regionSummaries = [...byReg.entries()].map(([reg, rrows]) => {
      const sh = rrows.filter(r =>  r.isShipped).reduce((s, r) => s + r.salesAmt, 0);
      const op = rrows.filter(r => !r.isShipped).reduce((s, r) => s + r.salesAmt, 0);
      const tt = sh + op;
      const pr = rrows.reduce((s, r) => s + r.profit, 0);
      const bg = repSummaries.filter(r => r.region === reg).reduce((s, r) => s + r.budgetYtd, 0);
      const wkRows = currentWeek ? rrows.filter(r => r.weekStart === currentWeek) : [];
      return {
        region: reg, shippedYtd: sh, openYtd: op, budgetYtd: bg,
        totalYtd: tt, pctToBudget: bg > 0 ? tt / bg : 0,
        marginDollar: pr, marginPct: tt > 0 ? pr / tt : 0,
        newBizWeek: wkRows.reduce((s, r) => s + r.salesAmt, 0),
      };
    });

    const sh = rows.filter(r =>  r.isShipped).reduce((s, r) => s + r.salesAmt, 0);
    const op = rows.filter(r => !r.isShipped).reduce((s, r) => s + r.salesAmt, 0);
    const tt = sh + op;
    const pr = rows.reduce((s, r) => s + r.profit, 0);
    const bg = repSummaries.reduce((s, r) => s + r.budgetYtd, 0);
    const wk = currentWeek
      ? rows.filter(r => r.weekStart === currentWeek).reduce((s, r) => s + r.salesAmt, 0)
      : 0;

    return {
      ...dataset,
      rows,
      repSummaries,
      categorySummaries,
      regionSummaries,
      global: {
        shippedYtd:   sh,
        openYtd:      op,
        budgetYtd:    bg,
        totalYtd:     tt,
        pctToBudget:  bg > 0 ? tt / bg : 0,
        marginDollar: pr,
        marginPct:    tt > 0 ? pr / tt : 0,
        newBizWeek:   wk,
      },
    };
  }

  /* ─────────────────────────────────────────────
     9. LOCAL STORAGE CACHE
  ───────────────────────────────────────────────── */
  const Cache = {
    save(csvText, sourceLabel) {
      try {
        localStorage.setItem(DS_CACHE_KEY,  csvText);
        localStorage.setItem(DS_TS_KEY,     new Date().toISOString());
        localStorage.setItem(DS_SOURCE_KEY, sourceLabel || 'unknown');
      } catch (e) { console.warn('[DS] Cache write failed:', e.message); }
    },
    load() {
      return {
        csv:       localStorage.getItem(DS_CACHE_KEY)  || null,
        timestamp: localStorage.getItem(DS_TS_KEY)     || null,
        source:    localStorage.getItem(DS_SOURCE_KEY) || null,
      };
    },
    clear() {
      [DS_CACHE_KEY, DS_TS_KEY, DS_SOURCE_KEY].forEach(k => localStorage.removeItem(k));
    },
    has() { return !!localStorage.getItem(DS_CACHE_KEY); },
  };

  /* ─────────────────────────────────────────────
     10. FILE READER — Windows-1252 for Oracle ERP exports
  ───────────────────────────────────────────────── */
  function readLocalFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error('No file provided.')); return; }
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error('File read error.'));
      reader.readAsText(file, 'windows-1252');
    });
  }

  /* ─────────────────────────────────────────────
     11. FETCH FROM URL
  ───────────────────────────────────────────────── */
  async function fetchFromUrl(url) {
    if (!url || !url.trim()) throw new Error('No URL configured.');
    const cacheBust = `${url}${url.includes('?') ? '&' : '?'}_cb=${Date.now()}`;
    const resp = await fetch(cacheBust);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    const text = await resp.text();
    if (!text || text.trim().length < 10) throw new Error('Response was empty.');
    return text;
  }

  /* ─────────────────────────────────────────────
     12. CSV TEMPLATE GENERATOR
  ───────────────────────────────────────────────── */
  function generateTemplate() {
    const headers = [
      'SALESREP_NAME', 'TERRITORY_NAME', 'REGION', 'PRODUCT_TYPE',
      'Sales', 'OPEN_FLAG', 'PROFIT', 'MARGIN%',
      'CREATION_DATE', 'PERIOD_NAME', 'WEEK_OF_YEAR',
    ].join(',');
    const example = [
      'Jane Smith', 'Canada West', 'CAN', 'STICKS',
      '15000', 'Shipped Only', '9300', '62%',
      '2/20/2026 9:00', '26-Feb', '8',
    ].join(',');
    return `${headers}\n${example}\n`;
  }

  /* ─────────────────────────────────────────────
     13. FORMATTING UTILITIES
  ───────────────────────────────────────────────── */
  function formatMoney(v, currency) {
    const abs  = Math.abs(v || 0);
    const sign = v < 0 ? '-' : '';
    const sym  = (currency || 'USD') === 'EUR' ? '€' : '$';
    if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000)     return `${sign}${sym}${(abs / 1_000).toFixed(1)}K`;
    return `${sign}${sym}${abs.toFixed(0)}`;
  }

  function formatPct(v) { return `${((v || 0) * 100).toFixed(1)}%`; }

  function formatDate(d) {
    if (!d) return '—';
    if (typeof d === 'string') return d;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* ─────────────────────────────────────────────
     14. PUBLIC API
  ───────────────────────────────────────────────── */
  window.DS = {
    parseCSV,
    buildDataset,
    filterDataset,
    normalizeRow,

    /* Main entry: load by mode, with cache fallback */
    async load({ mode = 'file', url = '', file = null } = {}) {
      let csvText = null, fromCache = false, sourceLabel = '';

      if (mode === 'url') {
        try {
          csvText     = await fetchFromUrl(url);
          sourceLabel = `URL: ${url.slice(0, 60)}${url.length > 60 ? '…' : ''}`;
          Cache.save(csvText, sourceLabel);
        } catch (err) {
          console.warn('[DS] URL fetch failed, using cache:', err.message);
          const cached = Cache.load();
          if (cached.csv) { csvText = cached.csv; fromCache = true; sourceLabel = cached.source; }
          else throw err;
        }
      } else {
        if (file) {
          try {
            csvText     = await readLocalFile(file);
            sourceLabel = `File: ${file.name}`;
            Cache.save(csvText, sourceLabel);
          } catch (err) {
            console.warn('[DS] File read error:', err.message);
          }
        }
        if (!csvText) {
          const cached = Cache.load();
          if (cached.csv) {
            csvText = cached.csv; fromCache = true;
            sourceLabel = cached.source || 'Cached file';
          } else {
            throw new Error('No data available. Please upload your CSV file.');
          }
        }
      }

      const rawRows = parseCSV(csvText);
      if (!rawRows.length) throw new Error('CSV parsed to zero rows — check file format.');

      const dataset  = buildDataset(rawRows);
      const ts       = fromCache ? Cache.load().timestamp : new Date().toISOString();
      return { dataset, fromCache, sourceLabel, timestamp: ts };
    },

    clearCache:   Cache.clear.bind(Cache),
    hasCache:     Cache.has.bind(Cache),
    getCacheInfo: Cache.load.bind(Cache),

    /* Budget helpers for config panel */
    getBudgets:        Budget.load,
    saveBudgets:       Budget.save,
    parseBudgetText:   Budget.parseText,
    budgetsToText:     Budget.toText,

    generateTemplate,
    formatMoney,
    formatPct,
    formatDate,
    num,
    pct,
  };

}(window));
