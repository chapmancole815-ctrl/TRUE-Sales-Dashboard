/* ═══════════════════════════════════════════════════════════════
   TRUE SPORTS — SALES DASHBOARD  |  components.js
   Pure UI render functions — NO business logic, NO data fetching.
   All functions return HTML strings or DOM elements.
   ═══════════════════════════════════════════════════════════════ */

'use strict';

(function (window) {

  /* ─────────────────────────────────────────────
     SAFE HTML ESCAPING
  ───────────────────────────────────────────────── */
  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ─────────────────────────────────────────────
     1. KPI CARD — returns a DOM Element
     Props:
       id, label, value, trend ('up'|'down'|'flat'),
       sub, spark (number[]), accent (css class string),
       tooltip, colorClass
  ───────────────────────────────────────────────── */
  function createKpiCard({ id, label, value, trend, sub, spark = [], accent = '', tooltip = '', colorClass = '' }) {
    const el = document.createElement('div');
    el.className = `kpi-card ${accent}`;
    if (tooltip) el.dataset.tooltip = tooltip;
    if (id) el.id = id;

    const trendArrow = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '—';
    const trendCls   = trend || 'flat';
    const sparkHtml  = spark.length ? createSparklineHTML(spark) : '';

    el.innerHTML = `
      <div class="kpi-label">${esc(label)}</div>
      <div class="kpi-value ${esc(colorClass)}">${esc(value)}</div>
      <div class="kpi-trend ${trendCls}">
        <span>${trendArrow}</span>
        <span class="kpi-sub">${esc(sub || '')}</span>
      </div>
      ${sparkHtml ? `<div class="kpi-sparkline-wrap">${sparkHtml}</div>` : ''}
    `;
    return el;
  }

  /* ─────────────────────────────────────────────
     2. SVG SPARKLINE — returns HTML string
     Values: number array (e.g. monthly totals)
     Renders as a smooth polyline with area fill.
  ───────────────────────────────────────────────── */
  function createSparklineHTML(values) {
    if (!values || values.length < 2) return '';
    const w = 200, h = 36;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const points = values.map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return [x, y];
    });

    const polyline = points.map(([x,y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    // Area path: start bottom-left → points → end bottom-right
    const areaPath =
      `M 0,${h} ` +
      points.map(([x,y]) => `L ${x.toFixed(1)},${y.toFixed(1)}`).join(' ') +
      ` L ${w},${h} Z`;

    return `
      <svg class="sparkline-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
        <path class="spark-area" d="${areaPath}" />
        <polyline points="${polyline}" style="fill:none;stroke:var(--color-brand-accent);stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round"/>
        <circle cx="${points[points.length-1][0].toFixed(1)}" cy="${points[points.length-1][1].toFixed(1)}" r="2.5" fill="var(--color-brand-accent)"/>
      </svg>
    `;
  }

  /* ─────────────────────────────────────────────
     3. PROGRESS BAR — returns HTML string
     Props:
       pct (0-1), label, thresholdClass ('green'|'yellow'|'red')
       showTarget: bool — draws a thin target line at 1.0
  ───────────────────────────────────────────────── */
  function createProgressBarHTML({ pct = 0, label = '', thresholdClass = 'green', showTarget = true }) {
    const fillWidth = Math.min(pct * 100, 100).toFixed(1);
    const overflow  = pct > 1;
    const displayLabel = label || `${(pct * 100).toFixed(1)}%`;
    const colorMap = { green: 'var(--color-green)', yellow: 'var(--color-brand-accent)', red: 'var(--color-red)' };
    const color = colorMap[thresholdClass] || 'var(--color-green)';

    return `
      <div class="progress-wrap">
        <div class="progress-track" style="position:relative;">
          <div class="progress-fill ${thresholdClass}"
            style="width:${fillWidth}%; background:${color}; ${overflow ? 'border-radius:var(--radius-full);' : ''}">
          </div>
          ${showTarget ? `<div style="position:absolute;top:0;bottom:0;right:0;width:2px;background:var(--chart-budget);opacity:0.4;"></div>` : ''}
        </div>
        <div class="progress-label">
          <span style="color:${color}; font-weight:800;">${esc(displayLabel)}</span>
          ${overflow ? '<span class="badge badge-new" style="padding:1px 5px;font-size:9px;">✓ OVER</span>' : ''}
        </div>
      </div>
    `;
  }

  /* ─────────────────────────────────────────────
     4. BADGE — returns HTML string
     Props: label, cls (badge-gold etc.)
  ───────────────────────────────────────────────── */
  function createBadgeHTML({ label, cls = '' }) {
    return `<span class="badge ${esc(cls)}">${esc(label)}</span>`;
  }

  /* ─────────────────────────────────────────────
     5. MINI BARS (4-week trend) — returns HTML string
     values: number[4] — last 4 weeks new business
  ───────────────────────────────────────────────── */
  function createMiniBarsHTML(values = []) {
    if (!values.length) return '<span class="text-muted" style="font-size:11px;">—</span>';
    const max = Math.max(...values, 0.01);
    return `
      <div class="minibars-wrap" title="4-week new business trend">
        ${values.map((v, i) => {
          const h = Math.max((v / max) * 100, 4).toFixed(0);
          const isLatest = i === values.length - 1;
          return `<div class="minibar ${isLatest ? 'latest' : ''}" style="height:${h}%" title="${DS.formatMoney(v)}"></div>`;
        }).join('')}
      </div>
    `;
  }

  /* ─────────────────────────────────────────────
     6. LEADERBOARD TABLE — returns HTML string
     Props:
       rows: [{rank, rep, sub, cols:[{val,cls,isHtml}], badges:[{label,cls}], tooltip}]
       headers: string[]
       tableId: string
       onSort: fn(colKey) — NOT wired here; caller wires it externally
  ───────────────────────────────────────────────── */
  function createLeaderboardTable({ rows = [], headers = [], tableId = '', onSort }) {
    if (!rows.length) {
      return `<div style="padding:2rem;text-align:center;color:var(--text-muted);">No data available. Upload a CSV to get started.</div>`;
    }

    const headHtml = headers.map((h, i) => {
      if (i === 0) return `<th style="width:40px;text-align:center;">#</th>`;
      if (i === 1) return `<th>Rep</th>`;
      return `<th>${esc(h)}</th>`;
    }).join('');

    const bodyHtml = rows.map(row => {
      const rankCls = row.rank === 1 ? 'rank-top1' : row.rank === 2 ? 'rank-top2' : row.rank === 3 ? 'rank-top3' : '';
      const rankEmoji = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : row.rank;
      const badgeHtml = (row.badges || []).map(b => createBadgeHTML(b)).join(' ');
      const tooltipAttr = row.tooltip ? `data-tooltip="${esc(row.tooltip)}"` : '';

      const colsHtml = (row.cols || []).map(col => {
        if (col.isHtml) return `<td class="${esc(col.cls || '')}">${col.val}</td>`;
        return `<td class="${esc(col.cls || '')}">${esc(String(col.val ?? ''))}</td>`;
      }).join('');

      return `
        <tr ${tooltipAttr}>
          <td class="rank-cell ${rankCls}" style="text-align:center;">${rankEmoji}</td>
          <td class="rep-cell">
            <div>${esc(row.rep || '')}</div>
            ${row.sub ? `<div class="rep-territory">${esc(row.sub)}</div>` : ''}
            ${badgeHtml ? `<div class="badge-row">${badgeHtml}</div>` : ''}
          </td>
          ${colsHtml}
        </tr>
      `;
    }).join('');

    return `
      <table class="leaderboard-table" id="${esc(tableId)}">
        <thead><tr>${headHtml}</tr></thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    `;
  }

  /* ─────────────────────────────────────────────
     7. REGION PANEL — returns HTML string
     Props: region, flag, label, total, budget,
            pct, margin, newBiz, topRep, thresholds
  ───────────────────────────────────────────────── */
  function createRegionPanel({ region, flag, label, total, budget, pct, margin, newBiz, topRep, thresholds }) {
    const tcls   = pct >= thresholds.yellow ? 'text-green' : pct >= thresholds.red ? 'text-yellow' : 'text-red';
    const barCls = pct >= thresholds.yellow ? 'green' : pct >= thresholds.red ? 'yellow' : 'red';
    const progressBar = createProgressBarHTML({ pct, thresholdClass: barCls });

    return `
      <div class="region-label">
        <span class="region-flag">${esc(flag)}</span>
        ${esc(label)}
      </div>
      <div class="region-metric">
        <div class="region-metric-value">${DS.formatMoney(total)}</div>
        <div class="region-metric-label">YTD Total (vs ${DS.formatMoney(budget)} budget)</div>
        <div class="region-metric-bar">${progressBar}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px;">
        <div class="cat-kpi-item">
          <div class="cat-kpi-val ${tcls}">${DS.formatPct(pct)}</div>
          <div class="cat-kpi-lbl">% to Budget</div>
        </div>
        <div class="cat-kpi-item">
          <div class="cat-kpi-val">${DS.formatPct(margin)}</div>
          <div class="cat-kpi-lbl">Gross Margin %</div>
        </div>
        <div class="cat-kpi-item">
          <div class="cat-kpi-val text-gold">${DS.formatMoney(newBiz)}</div>
          <div class="cat-kpi-lbl">New Biz (Week)</div>
        </div>
        <div class="cat-kpi-item">
          <div class="cat-kpi-val" style="font-size:14px;font-weight:700;">${topRep ? esc(topRep.repName) : '—'}</div>
          <div class="cat-kpi-lbl">Top Rep</div>
        </div>
      </div>
    `;
  }

  /* ─────────────────────────────────────────────
     8. CATEGORY STACK BAR — returns HTML string
     Props: naPct (0-1), euPct (0-1), naTotal, euTotal
  ───────────────────────────────────────────────── */
  function createCategoryStackBarHTML({ naPct = 0, euPct = 0, naTotal = 0, euTotal = 0 }) {
    const naW = (naPct * 100).toFixed(1);
    const euW = (euPct * 100).toFixed(1);
    return `
      <div class="stack-bar-wrap">
        <div class="stack-label">Regional Mix</div>
        <div class="stack-track">
          <div class="stack-segment stack-na" style="width:${naW}%"
            title="NA: ${DS.formatMoney(naTotal)} (${naW}%)"></div>
          <div class="stack-segment stack-eu" style="width:${euW}%"
            title="EU: ${DS.formatMoney(euTotal)} (${euW}%)"></div>
        </div>
        <div class="stack-legend">
          <div class="stack-legend-item">
            <div class="stack-dot stack-dot-na"></div>
            <span>NA: ${DS.formatMoney(naTotal)}</span>
          </div>
          <div class="stack-legend-item">
            <div class="stack-dot stack-dot-eu"></div>
            <span>EU: ${DS.formatMoney(euTotal)}</span>
          </div>
        </div>
      </div>
    `;
  }

  /* ─────────────────────────────────────────────
     9. WORKHORSE WINNER CARD — returns HTML string
     Props:
       winner: rep object with whScore
       runners: rep[] (runner-ups)
       bullets: [{icon, text}]
       month: string
  ───────────────────────────────────────────────── */
  function createWorkHorseCardHTML({ winner, runners = [], bullets = [], month = 'Month' }) {
    if (!winner) {
      return `<p class="text-muted" style="padding:2rem;">Insufficient data to compute Work Horse score.</p>`;
    }

    const scorePct = (winner.whScore * 100).toFixed(1);

    const bulletsHtml = bullets.map(b => `
      <div class="wh-bullet">
        <span class="wh-bullet-icon">${esc(b.icon)}</span>
        <span>${esc(b.text)}</span>
      </div>
    `).join('');

    const runnersHtml = runners.map((r, i) => `
      <div class="wh-runner-row">
        <span class="wh-runner-rank">${['🥈','🥉','4'][i] || i+2}</span>
        <span class="wh-runner-name">${esc(r.repName)}<br>
          <span class="rep-territory">${esc(r.territory || '')}</span>
        </span>
        <span class="wh-runner-score">${(r.whScore * 100).toFixed(1)}</span>
      </div>
    `).join('');

    return `
      <div class="workhorse-winner-card">
        <div class="wh-month-label">${esc(month)} — Work Horse</div>
        <div class="wh-crown">👑</div>
        <div class="wh-name">${esc(winner.repName)}</div>
        <div class="wh-territory">${esc(winner.territory || winner.region || '')}</div>
        <div class="wh-score-label">Composite Score</div>
        <div class="wh-score-val">${scorePct}</div>
        <div class="wh-score-sub">out of 100 · 50% budget · 30% new biz · 20% margin</div>
        <div class="wh-bullets">${bulletsHtml}</div>
      </div>
      <div class="wh-runners-up">
        <div class="wh-runners-title">Runner-Ups</div>
        ${runnersHtml || '<div class="text-muted" style="font-size:13px;padding:8px 0;">No runner-up data.</div>'}
        <div style="margin-top:16px;padding:12px;background:var(--surface-card-alt);border-radius:8px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px;">Scoring Formula</div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.6;">
            <strong>Score</strong> = 0.5 × (% to Budget) + 0.3 × (New Business) + 0.2 × (Margin %)<br>
            Each metric is normalized 0→1 across all reps before weighting.
          </div>
        </div>
      </div>
    `;
  }

  /* ─────────────────────────────────────────────
     PUBLIC API
  ───────────────────────────────────────────────── */
  window.UI = {
    createKpiCard,
    createSparklineHTML,
    createProgressBarHTML,
    createBadgeHTML,
    createMiniBarsHTML,
    createLeaderboardTable,
    createRegionPanel,
    createCategoryStackBarHTML,
    createWorkHorseCardHTML,
  };

}(window));
