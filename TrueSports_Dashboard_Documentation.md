# True Sports Performance Dashboard — Documentation

**Last Updated:** March 5, 2026  
**Data As Of:** March 2, 2026  
**Built By:** Cole (Head of Marketing) with Claude

---

## Overview

Single-file HTML dashboard (`TrueSports_Performance.html`) that runs entirely client-side — no server, no login, no dependencies beyond CDN scripts. Upload the weekly World Sales CSV and weekly incoming orders file and everything updates.

Four tabs: **Scoreboard → Leaderboards → Work Horse of the Month → Deep Dive**

---

## Master Controls (App Header)

### Team Toggle (Global)
| Option | What It Shows |
|--------|--------------|
| 🏒 All TRUE (default) | Full dataset — all reps, all channels |
| 🏪 Retail | Excludes 8 elite reps from all rankings, leaderboards, and budget calculations |
| ⭐ Elite | Shows only elite rep business |

**Elite Reps:** Adam Berkhoel, Lucas Gore, Dave Campbell, Jon Nassoura, Mitchell Walker, Scott Walker, Steve Boersma, Scott Brown

When Retail or Elite is active, a colored banner appears below the header confirming the active filter. **Budgets recompute** from rep-level data so % to budget is accurate per team.

### Currency Toggle
USD (default) / CAD

### Data Uploads
1. **World Sales CSV** — main data source, powers YTD numbers across all tabs
2. **Weekly Orders CSV/Excel** — incoming orders by rep and category, powers 3 Stars, Hot This Week, and Leaderboard weekly view

---

## Tab 1: Scoreboard

### Hero Section
- Region toggle: **Global / NA / EU**
- Large YTD revenue total with shipped/open breakdown
- % to Budget gauge with budget dollar amount displayed
- Region gauges below (4 regions for Global, CAN/USA/DTC for NA, 4 EU sub-regions for EU)

### ⭐ 3 Stars of the Week
Hockey-themed incoming orders spotlight — 1st, 2nd, 3rd Star from uploaded weekly data. Dark gradient header with combined gold total.

### Incoming Orders (2-column)
- **By Rep** — full ranked list with bars and medals
- **By Category** — color-coded bars with dollar values
- Week label displayed in white bold for visibility

### Charts Row
- **Channel Mix** doughnut (NA channels or EU sub-regions depending on region toggle)
- **Category Mix** doughnut

### Weekly Sales Trend
Line chart — NA vs EU, last 12 weeks

### Category Performance vs Budget
Horizontal bars showing each product category's YTD revenue vs annual budget with % indicator

---

## Tab 2: Leaderboards

### Summary Cards (Top of Page, Always YTD)
| Card | Metric | Source |
|------|--------|--------|
| 🏅 Top 5 — Pace to Budget | % to budget | Budgeted reps, YTD |
| 🔥 Hot This Week | Weekly incoming $ | Weekly orders upload |
| 📈 Top 5 — Gross Margin | GM% | Reps with min $25K revenue |

### Controls
- **Region:** 🌍 All (default) → 🇨🇦🇺🇸 NA → 🇪🇺 EU
  - When NA selected, sub-toggle appears: All NA / 🇨🇦 CAN / 🇺🇸 USA
- **Period:** This Week (from upload) / Month / YTD
- **Metric:** Revenue / % to Budget / GM%

### Top 8 Feature Chart
Animated ranked bars with podium styling (gold #1, medals for top 3). ELITE badge on elite rep names.

### Full Rankings Table
Scrollable ranked list of all reps matching current filters.

### Weekly Category Breakdown
Appears when "This Week" period is selected — shows all categories from weekly upload with bars, dollar values, and % share.

### Channel & Category Margin
Appears when GM% metric is selected — side-by-side channel and category margin rankings.

---

## Tab 3: Work Horse of the Month

Placeholder — reserved for monthly performance recognition feature.

---

## Tab 4: Deep Dive

### Timeframe Toggle
YTD (default) / By Week / By Month — affects Region view; Category view is YTD-only (amber notice shown when week/month selected).

### View: 🌎 Region
- **YTD:** Stacked bar chart (Shipped/Open/Total) + region detail table with % to budget
- **Week:** Weekly trend bar chart + selected week summary
- **Month:** Monthly trend + top reps for selected month

### View: 🏪 Channel
Region sub-toggle: NA / EU

**NA Channel:**
- Bar chart: Shipped/Open/Total by channel ranked by GM%
- Channel detail table: columns for Shipped, Open, Total, GM%
- Key Accounts and Specialty drilldown cards

**EU/ROW Channel (primary: tiers, secondary: sub-regions):**
- Bar chart: KA Big 4 / KA Top 10 / Others with Shipped/Open/Total
- Tier detail table
- Sub-Region Overview bar chart (Nordics, Western/Southern, Central/Eastern, ROW)
- 4 sub-region rep cards in 2×2 grid with GM% badges

### View: 📦 Category
- **Group toggle:** All / Catalog / Custom
- **Sort toggle:** % to Budget / Revenue / GM%
- Category summary bar with revenue, GM%, and % to budget per category
- **GM% mode:** Overall GM leaderboard + per-category rep rankings
- All views respect the master team filter

---

## EU Sub-Region Mapping

| Sub-Region | Reps |
|-----------|------|
| **Nordics** | Andreas Lindqvist, Petteri Linnonmaa |
| **Western/Southern** | Andrew McPherson, Jonathan Weaver, Filippo Dal Ben, Philippe Boudreault McNicoll |
| **Central/Eastern** | Andris Stepins, Tilen Smolnikar, ProjektS |
| **ROW** | Key Accounts Other, Dave McNally |

---

## Rep Team Classifications

| Classification | Reps |
|---------------|------|
| **Elite** | Adam Berkhoel, Lucas Gore, Dave Campbell, Jon Nassoura, Mitchell Walker, Scott Walker, Steve Boersma, Scott Brown |
| **Dual (Elite + Retail)** | Steve Boersma, Scott Brown |
| **Removed → Reassigned** | Corey Gregory → Dave McNally, Steve Sutherland → Dave McNally, Rich Vanbellinger → Dave Campbell |
| **Retail** | All other NA reps including Key Accounts US/Canada |

---

## GM% Calculation Rules

**Formula:** `GM% = (Revenue − COGS) ÷ Revenue × 100`

### COGS Sources (3-tier lookup)
1. **COGS.xlsx** — matched on ITEM_NUMBER (63.9% of rows)
2. **ITEM_COST** fallback from World Sales (9.6% of rows)
3. **Zero cost** — samples, demos, accessories (26.6% of rows)

### Color Thresholds
| Range | Color | Meaning |
|-------|-------|---------|
| ≥ 50% | 🟢 Green | Healthy margin |
| 40–50% | 🟡 Gold | Moderate — monitor |
| < 40% | 🔴 Red | Low margin |

### Known Limitations
- 26.6% zero-cost rows inflate GM% upward
- COGS.xlsx is a point-in-time snapshot
- GM% on category rankings is rep-level overall, not per-category
- Original PROFIT/COSTSALES columns in World Sales contain formula strings (unusable)

---

## Weekly Orders Upload Format

CSV or Excel with two sections:

```
REPS,TOTAL SALES
Marc-Andre Bellehumeur,278603.25
JEFF LYNCH,174024.65
...

CATEGORY,TOTAL SALES
SKATES - STOCK,430357.99
STICKS,233122.95
...
```

The parser looks for `REPS` and `CATEGORY` headers (case-insensitive). Grand Total rows are skipped. An optional `WEEK ENDING,Feb 27` row sets the display label.

---

## Required Files for Each Session

1. **Weekly World Sales CSV** — main data export
2. **USD Budget file** — annual budgets by rep
3. **CAD Budget file** — Canadian dollar budgets
4. **Budget template** — built during prior sessions
5. **Existing PPTX benchmark dashboard** — reference
6. **Weekly incoming orders CSV/Excel** — for 3 Stars and weekly leaderboard

---

## Pending / Future Work

- ROW region addition to main data
- Rep team column integration in source data
- Channel budget structure updates
- Dashboard renaming: "IN HOUSE" → Key Accounts Canada / Key Accounts US
- Adding "Other" to category mix
- Redirecting U.S.-PS to Elite channel
- Lucas Gore absent from current source data — needs confirmation
- 21 reps currently unbudgeted
- Blank category budgets for some reps
- Work Horse of the Month tab content
- Per-category per-rep GM% (currently uses overall rep GM)

---

## Tech Stack

- React 18 (CDN, Babel transpiled)
- Chart.js 4.4 (bar, line, doughnut charts)
- PapaParse (CSV parsing)
- SheetJS/XLSX (Excel parsing for weekly orders)
- Pure inline styles, no build step
- Fully client-side — no data leaves the browser
