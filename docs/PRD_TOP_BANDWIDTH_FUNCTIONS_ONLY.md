# PRD: Top Bandwidth Functions Optimization (Only)

## Scope (Strict)

Optimize only these functions:

1. `invoices.calculateInvoice`
2. `orders.getStats`
3. `analytics.getReturnsAnalysis`
4. `analytics.getPickingListStats`
5. `analytics.getTopSellingProducts`
6. `analytics.getSalesChartData`

Everything else is out of scope for this initiative.

---

## Goal

Reduce total database bandwidth for the six functions above by 70%+ while preserving complete business output.

Important constraint:
- Keep full data correctness (if page needs full totals and details, still return them).
- Reduce **unnecessary call frequency** and **wasted reads per call**.

---

## Current Findings (for in-scope functions)

## `invoices.calculateInvoice`

- Major contributor to bandwidth.
- Reads many aggregate/doc rows in period.
- Already improved with caching + targeted SKU read path, but still top cost center.

## `orders.getStats`

- Frequently called from dashboard snapshot.
- Uses `dailySales` (good), but fallback paths still read raw orders.
- Pending calculations still do capped raw scans.

## `analytics.getSalesChartData`

- Uses `dailySales` first (good), fallback reads raw orders.
- Still called repeatedly as part of dashboard snapshot payload.

## `analytics.getPickingListStats`

- Uses `dailySales` first, fallback raw orders.
- Triggered together with other dashboard analytics every snapshot call.

## `analytics.getTopSellingProducts`

- Reads `dailyStockRecords` + full `skus` map in fast path.
- Fallback scans order items.
- Called in same dashboard bundle even when user may not inspect that card.

## `analytics.getReturnsAnalysis`

- Reads returns + dailySales and builds chart.
- Can still read many rows depending on range.
- Also called every dashboard snapshot.

---

## Strategy

Use three levers, in this order:

1. **Call gating** (fewer executions).
2. **Snapshot splitting** (don’t fetch all analytics every dashboard load).
3. **Per-function read reduction** (smaller reads per execution).

---

## Implementation Plan

## Phase 1: Call Gating (Immediate)

1. Keep/strengthen 30-min backend snapshot cooldown for:
   - dashboard snapshot action
   - invoice snapshot action
2. Ensure dashboard manual refresh is the only force-bypass path.
3. Ensure invoice recalc runs on:
   - tab open
   - period change
   - explicit refresh only

Acceptance:
- No repeated heavy calls in background during idle viewing.

## Phase 2: Split Dashboard Snapshot (High Impact)

Current problem: one dashboard snapshot call executes all heavy analytics together.

Change:
- Create two actions:
  - `dashboard.getSummarySnapshot` -> includes `orders.getStats` + minimal required summary
  - `dashboard.getHeavyAnalyticsSnapshot` -> includes the four heavy analytics queries
- Frontend behavior:
  - load summary immediately on tab enter
  - load heavy analytics lazily (after summary render or on section visibility)
  - heavy analytics refresh button separate from summary refresh

Expected impact:
- Large drop in executions of the four analytics functions for users who only need top summary.

## Phase 3: Function-Level Read Optimizations

### A) `invoices.calculateInvoice`

- Keep aggregate-table-first execution only.
- Remove/strictly limit legacy fallback reads behind explicit backfill state.
- Add optional API split:
  - `getInvoiceSummary` (always)
  - `getInvoiceSkuBreakdown` (on expand)

### B) `orders.getStats`

- Prefer `dailySales` path always when available.
- Minimize pending scan:
  - read only fields needed for pending counters/revenue.
  - lower caps where safe and data-backed.

### C) `analytics.getSalesChartData`

- Use `dailySales` exclusively when rows exist in requested range.
- Fallback raw orders only for missing aggregate coverage and only for missing dates.

### D) `analytics.getPickingListStats`

- Build entirely from `dailySales` in normal path.
- Keep fallback path but reduce scan cap and range-limited fill only.

### E) `analytics.getTopSellingProducts`

- Avoid full `skus` read for every call:
  - resolve names only for top N SKUs after aggregation, or cache sku->name map.
- Consider pre-aggregated top-selling materialized table by day/month.

### F) `analytics.getReturnsAnalysis`

- Bound return scan by period and shopDomain with strict index-first path.
- For all-time mode, serve from cached/materialized aggregate instead of wide scans.

---

## Rollout Order

1. Dashboard split snapshot (Phase 2).
2. `invoices.calculateInvoice` summary/detail split.
3. `orders.getStats` + `analytics.getSalesChartData` read tuning.
4. `analytics.getPickingListStats` + `analytics.getTopSellingProducts` + `analytics.getReturnsAnalysis`.

Each step deploys independently with metric check before next step.

---

## Metrics & Targets

Track only these six functions:

- Calls/day
- Avg bytes read
- p95 bytes read
- Avg docs read
- p95 docs read

Targets:

- `invoices.calculateInvoice`: -80%+ bytes/day
- `orders.getStats`: -60%+ bytes/day
- each `analytics.*` listed: -60%+ bytes/day
- combined top-6 bandwidth reduction: -70%+

---

## Risks

- Data freshness concerns if cooldown too aggressive.
  - Mitigation: explicit refresh controls + visible "last updated".

- Missing edge-case data if fallback reduced too much.
  - Mitigation: fallback only for uncovered ranges, not fully removed until aggregate coverage is validated.

---

## Definition of Done

- All six functions show sustained bandwidth reduction for 72h post deploy.
- No functional regression in invoice totals/dashboard charts.
- No user-reported stale-data confusion after refresh UX updates.

