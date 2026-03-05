# True Sports Performance Dashboard — Full Project Context

**Last updated:** March 5, 2026 (Session 12)
**File:** `TrueSports_Performance.html` (~283KB, single self-contained HTML)
**Stack:** React 18 + Babel standalone + PapaParse + Chart.js + SheetJS (XLSX) — all via CDN, no build step

---

## Who's Who

- **Cole** — Head of Marketing, building this dashboard. Primary user.
- **Derek** — CMO (Cole's boss). Big on clerical accuracy and clarity.
- **Dave McNally** — Chief of Commercial (Cole's other boss). Heavily involved in marketing.
- **Fabio** — Cole's direct report. Will help with Monday uploads.

---

## What This Is

An interactive sales performance dashboard for True Sports (hockey equipment company). Single HTML file with all data baked in. Four tabs: Scoreboard, Leaderboards, President's Club, Deep Dive. Dark theme. Admin mode for data uploads, team mode for read-only viewing.

---

## Architecture

### Single-file HTML structure
```
<head> — CDN scripts (React, ReactDOM, Babel, PapaParse, Chart.js, XLSX), fonts, CSS
<body>
  <div id="root"/>
  <script type="text/babel"> — ALL app code (constants, parsers, components, rendering)
  <script> — Source capture for export (window.__RAW_BABEL_SRC)
```

### Data flow
1. **DEFAULT_DATA** — Baked-in World Sales aggregation (lines ~210)
2. **DEFAULT_COGS** — Baked-in COGS map, 3,136 SKUs (lines ~307)
3. **DEFAULT_WEEKLY** — Baked-in weekly orders data (lines ~308)
4. Admin uploads override these at runtime via `useState`
5. Export button bakes current runtime state back into a new HTML file

### Admin mode
- Password: `true2026`
- Shows upload zones: COGS.xlsx, World Sales CSV, Weekly Orders CSV
- Shows Export Dashboard button
- Shows workhorse name entry on President's Club tab

---

## Key Constants (all near top of babel script)

### Rep Classifications
```js
CA_REPS       — Canadian reps (for CAN/USA filtering)
ELITE_REPS    — Adam Berkhoel, Lucas Gore, Dave Campbell, Jon Nassoura, 
                MITCHELL WALKER, SCOTT WALKER, Steve Boersma, SCOTT BROWN, Mario Therrien
DUAL_REPS     — Steve Boersma (appears in both Elite + Retail)
PC_ELIGIBLE   — 19 reps eligible for President's Club points (whitelist)
LB_REPS       — 21 reps shown in Leaderboard rankings (PC_ELIGIBLE + Key Accounts CAN/US)
CLUB_EXCLUDED — Legacy exclusion set (still defined but President's Club now uses PC_ELIGIBLE whitelist)
```

### PC_ELIGIBLE roster (19 reps)
```
Brad Savelson, Brent Hobday, Greg Pettis, JEFF LYNCH,
Marc-Andre Bellehumeur, Mario Richard, Scott Sissions, WES HUETHER,
Jesse Nifong (Hockey), Matt Shaw, Steve Boersma, VINCENT PIZZO, Zac Lampson,
Andris Stepins, Filippo Dal Ben, Jonathan Weaver, PETTERI LINNONMAA,
PHILIPPE BOUDREAULT MCNICOLL, Tilen Smolnikar
```

### Rep Reassignment
```js
REP_REASSIGN = {
  "Corey Gregory"     → "DAVE MCNALLY",
  "Steve Sutherland"   → "DAVE MCNALLY",
  "RICH VANBELLINGER"  → "Dave Campbell"
}
// "IN HOUSE" rep → "Key Accounts Canada" or "Key Accounts US" based on region
```

### Budgets
```js
VIEW_BUDGETS = {
  global: 48,461,721.16,    // All channels + EU + ROW
  na:     39,989,921.16,    // All NA channels (KA + Specialty + Elite + DTC + Other)
  can:    21,192,048.33,
  usa:    18,797,872.83,
  eu:      7,471,800,
  row:     1,000,000
}

CHANNEL_BUDGETS = {
  "Key Account N-A":  14,287,183.61,
  "Specialty N-A":    15,287,477.71,
  "Elite":             6,000,000,
  "DTC":               2,275,000,
  "Other N-A":         2,140,259.84
}

REP_BUDGETS   — Per-rep fiscal year budget (keyed by rep name, has .c country and .f budget)
CAT_BUDGETS   — Per-rep per-category budget (6 categories × ~30 reps)
```

### Channel Mapping (`getCh` function)
- DTC: `TRUE ATHLETE` customer rollup + dtc flag
- Elite/Pro: `TRUE HOCKEY`, `TRUE ATHLETE`, `PRO TEAM`, `PRO AGENCY`, or rep in ELITE_REPS
- Key Accounts: `SPORT CHEK`, `PRO HOCKEY LIFE`, `PURE HOCKEY`, `PERANIS`, `MONKEY`, `PIAS`, `IN HOUSE`
- Specialty: `FGL`, `SOURCE FOR SPORTS`, `SPORTS EXCELLENCE`, `INDEPENDENTS`, `HOCKEY HOUND`, `SPORTS AUX PUCES`
- Other: `REPS CANADA`, `REPS USA`, `DISTRIBUTORS NA`, `U.S.-PS` territory
- EU: Everything else for non-NA regions

### Category Mapping (`getCat` function)
- Sticks, Custom Skates, Stock Skates, Custom Goalie, Stock Goalie, Other

### EU Sub-regions (`EU_SUB`)
```
Nordics:          Sweden, Finland, Norway, Denmark, Iceland
Western/Southern: UK, France, Germany, Switzerland, Austria, Italy, Spain, Czechia, Netherlands, Belgium
Central/Eastern:  Latvia, Lithuania, Estonia, Poland, Slovenia, Slovakia, Hungary, Croatia, Romania
ROW:              everything else
```

---

## CSV Parsing

### World Sales CSV (`parseCSV`)
Key columns read: `SALESREP_NAME`, `REGION`, `PRODUCT_TYPE`, `CUSTOMER_ROLLUP_NAME`, `ORDER_TYPE`, `OPEN_FLAG`, `Sales`, `ORDERED_DATE`, `TERRITORY_NAME`, `ITEM_NUMBER`, `ORDERED_QUANTITY`, `MARGIN%`

- Filters to `PERIOD_YEAR === 2026` only
- `MARGIN%` (column E) parsed per row → used for simple-average GM% calculation
- Cost parsing: tries `COSTSALES` first (skips formula strings starting with `=`), falls back to `ITEM_COST × Quantity`, then COGS lookup by item number

### GM% Calculation
**Simple average of `MARGIN%` column** across each grouping (not weighted by revenue).
- Per rep: sum of MARGIN% values / count of rows with valid MARGIN%
- Per channel: same approach
- Per category: same approach
- Tracked via `ms` (margin sum) and `mc` (margin count) on each accumulator

### Weekly Orders CSV (`parseWeeklyCSV`)
Expected columns: `REPS` (or `REP`), `CATEGORY` (or `CAT`), plus a numeric total column
- Produces `{week_label, reps: [{rep, total, gm}], cats: [{cat, total}]}`

### COGS Upload (COGS.xlsx via `CogsUploadBar`)
- Reads `ITEM_NUMBER` (or `ITEM`) and `ITEM_COST` columns
- Builds a `{sku: cost}` lookup map (3,136 SKUs currently baked in)
- 3-tier cost resolution per row: COSTSALES → ITEM_COST fallback → COGS lookup → 0

---

## Aggregation Pipeline

`parseCSV` → row-level data → `buildData(rows, cogsMap, weeklyOrders)`:

| Output    | Description |
|-----------|-------------|
| `d1`      | Region totals (CAN, USA, Europe/ROW, DTC, GLOBAL) with shipped/open/budget/pct |
| `d2`      | Channel totals (Key Accounts, Specialty, Elite/Pro, DTC, Other) with GM% |
| `d2_drill`| KA and Specialty sub-account breakdowns |
| `d3`      | EU tier breakdown (KA-Big 4, KA-Top 10, Others) |
| `d4`      | NA rep scorecards via `fR()` — total, pct, weekly, budget, gm, profit |
| `d5`      | NA category × rep matrix via `fC()` — top 10 reps per category |
| `d6`      | EU rep scorecards via `fR()` |
| `d7`      | EU category × rep matrix via `fC()` |
| `monthly_na/eu` | Monthly revenue by rep |
| `weekly_trend`  | Weekly NA vs EU revenue (last 12 weeks) |
| `category_mix`  | Category totals with GM% |
| `channel_margin`| Channel-level margin data including EU |

---

## Components

### `App` (line ~1789)
- State: `data`, `weeklyOrders`, `cogsMap`, `isAdmin`, `tab`, `masterTeam`, `workhorse`
- Admin toggle, tab nav, team filter (All/Retail/Elite)
- Export Dashboard button (admin only)

### `Scoreboard` (line ~441)
- Hero gauge (big number + radial progress)
- Region toggle: Global / NA / EU
- **NA drill-down toggle**: Total / Retail / Elite / DTC (each with channel-appropriate budget)
- Sub-gauges grid (CAN/USA for NA-Total, KA/Specialty for Retail, EU sub-regions for EU)
- Sutherland's 3 Stars (weekly points: Revenue 40/30/20 + GM 40/30/20 + Workhorse up to 20)
- Channel mix donut chart
- Category mix donut chart

### `Leaderboards` (line ~801)
- Revenue rankings (YTD + weekly toggle)
- GM% rankings (YTD only — weekly toggle removed)
- Region filter: NA / CAN / USA
- Filtered to `LB_REPS` set (21 reps including Key Accounts CAN/US)
- Podium (top 3) + full ranked list with progress bars

### `DeepDive` (line ~1017)
- Weekly trend chart (NA vs EU stacked)
- Monthly revenue chart (stacked bar)
- Category × rep tables (top 10 per category with budget % attainment)
- Channel margin breakdown
- EU sub-region breakdown with chart

### `PresidentsClub` (line ~1598)
- Formula explainer section
- Weekly standings table (Revenue pts + GM pts + Workhorse pts = Total)
- Uses `PC_ELIGIBLE` whitelist (19 reps) — not `LB_REPS`
- Workhorse names entered manually by admin (3 slots, up to 20 pts each)
- Points: Top 3 weekly revenue = 40/30/20 pts, Top 3 weekly GM% = 40/30/20 pts, Workhorse = admin input

---

## Export Feature

**Button:** "📦 Export Dashboard for Team" (admin only)

**How it works:**
1. Reads raw Babel source from `window.__RAW_BABEL_SRC` (captured at page load)
2. Replaces `DEFAULT_DATA` and `DEFAULT_WEEKLY` constants with current live state
3. Pre-compiles JSX → plain JS via `Babel.transform(src, {presets:['react']})`
4. Escapes `</` sequences in output (`safeJSON`)
5. Builds clean HTML with hardcoded CDN links (no Babel CDN needed in export)
6. Downloads as `TrueSports_Dashboard_YYYY-MM-DD.html`

**Key markers for string replacement:**
- `const DEFAULT_DATA=` ... up to `\nconst DEFAULT_COGS=`
- `const DEFAULT_WEEKLY=` ... up to `\nfunction parseWeeklyCSV`

---

## Weekly Workflow (Intended)

1. Monday morning: Cole/Fabio opens `TrueSports_Performance.html` locally
2. Admin mode → upload World Sales CSV + Weekly Orders CSV
3. Verify data → click Export
4. Upload exported file to SharePoint (same folder, same filename)
5. Team accesses bookmarked SharePoint link — sees latest data, no uploads needed

---

## Source Files Required for Each Session

1. **World Sales CSV** — main data export (SALESREP_NAME, REGION, Sales, MARGIN%, etc.)
2. **USD Budget file** — for budget reference/updates
3. **CAD Budget file** — for budget reference/updates
4. **Weekly Orders CSV** — rep-level weekly revenue + GM% + category breakdown
5. **COGS.xlsx** — SKU-level cost data (only if COGS change)
6. **TrueSports_Performance.html** — the current dashboard file

---

## Pending / Queued Changes

- [ ] ROW region addition (separate from EU)
- [ ] Rep team column integration
- [ ] Channel budget structure updates
- [ ] Dashboard renaming: "IN HOUSE" → Key Accounts Canada / Key Accounts US
- [ ] Adding "Other" to category mix (already exists but may need refinement)
- [ ] Redirecting U.S.-PS territory to Elite channel
- [ ] Weekly GM% per-category per-rep (currently uses overall rep GM)
- [ ] Point accumulation across weeks (currently single-week snapshot)
- [ ] Leadership & Culture Score input (10% of final President's Club formula)
- [ ] 21 reps currently unbudgeted
- [ ] Blank category budgets for some reps
- [ ] Lucas Gore absent from current source data (confirmed Elite rep)
- [ ] Export feature needs real-world testing on locally-opened file

---

## Session 12 Changes (This Session)

1. **Export Dashboard button** — pre-compiles JSX, bakes data, downloads self-contained HTML
2. **GM% switched to MARGIN% column average** — simple avg of column E, replaces COGS-based weighted calc
3. **Grey text → white** — CSS vars and hardcoded chart colors updated for dark theme readability
4. **GM rankings YTD only** — removed weekly toggle from GM leaderboard
5. **PC_ELIGIBLE whitelist** — 19 named reps, replaces old exclusion-based filtering for President's Club and 3 Stars
6. **LB_REPS updated** — matches PC_ELIGIBLE + Key Accounts Canada/US (21 total)
7. **NA drill-down on Scoreboard** — Total ($39.99M) / Retail ($29.57M) / Elite ($6M) / DTC ($2.275M) toggles with channel budgets
8. **NA total budget updated** — $29.57M → $39.99M (all channels)

---

## CSS Theme

```css
--bg: #070b14          --card: #0d1320        --card-border: #1a2540
--blue: #3b82f6        --cyan: #22d3ee        --gold: #f59e0b
--green: #10b981       --red: #ef4444         --amber: #f59e0b
--text: #e2e8f0        --text-dim: #e2e8f0    --text-muted: #cbd5e1
```

Font: Outfit (UI) + JetBrains Mono (numbers)

---

## Important Notes for Continuation

- **The file is huge (~283KB).** Most of that is `DEFAULT_DATA` and `DEFAULT_COGS` baked inline. When editing, use `str_replace` with unique context strings, not line numbers.
- **Babel compiles JSX at runtime.** The source lives in `<script type="text/babel">`. Brace/paren balance is critical — always validate after edits.
- **Budget data is hardcoded** in `VIEW_BUDGETS`, `CHANNEL_BUDGETS`, `REP_BUDGETS`, `CAT_BUDGETS`. Any budget restructure means updating these constants.
- **GM% uses simple average of MARGIN% column** from World Sales CSV. Not weighted by revenue. Not COGS-based.
- **Export pre-compiles JSX** so the exported file doesn't need Babel CDN. This is intentional — previous attempts using `<script type="text/babel">` in the export produced blank pages.
- **`window.__RAW_BABEL_SRC`** is captured by a regular `<script>` tag placed after the babel script tag, before `</body>`.
