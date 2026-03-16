# PRD: Convex Bandwidth Reduction

**Owner:** VNT Dash Team  
**Date:** 2026-02-17  
**Status:** Draft for implementation

## 1) Problem

Convex bandwidth cost is disproportionately high for current usage (about 2 users, ~200 orders/day).  
Function-level bandwidth shows major hotspots in one day:

- `invoices.calculateInvoice` (~7.41 GB reads/day)
- `pickingLists.getWithOrders` (~1.22 GB)
- `orders.listPaginated` (~905 MB)
- `orders.getStats` (~754 MB)
- `orders.searchByText` (~636 MB)
- Analytics queries (`getPickingListStats`, `getReturnsAnalysis`, `getTopSellingProducts`, `getSalesChartData`, `getSkuMetrics`, `getStatusDistribution`) each in the hundreds of MB.

This cost profile is not sustainable and does not match business scale.

## 2) Why It Happens (Current Root Causes)

### Backend patterns increasing bandwidth

- Heavy `collect()` and high `take()` usage in dashboard/analytics paths (1000-12000 rows in some queries).
- Some endpoints return full order documents where list projections are enough.
- `pickingLists.getWithOrders` fetches list items + full order docs for entire list in one reactive payload.
- `invoices.calculateInvoice` still assembles SKU breakdown from order-level snapshots and returns full breakdown every subscription refresh.
- Search fallback scans up to 2000 recent orders in-memory (`orders.searchByText`) for broad text search.

### Frontend patterns increasing bandwidth

- Dashboard page subscribes to many heavy `useQuery` calls at once, all reactive.
- Invoice detail page uses `useQuery(api.invoices.calculateInvoice, ...)` (reactive) for a report-like screen that does not need live updates every second.
- Orders page starts with `initialNumItems: 100`, then does significant client-side filtering/search on loaded rows.
- Picking list detail subscribes to full `getWithOrders` payload and keeps it reactive.

## 3) Goals

- Reduce total Convex database bandwidth by **70-90%**.
- Bring `invoices.calculateInvoice` from multi-GB/day down to **<500 MB/day**.
- Bring each top analytics/orders hot query into **double-digit MB/day** range where feasible.
- Preserve current UX quality (no missing data, no correctness regressions).

## 4) Non-Goals

- Rewriting the entire reporting stack.
- Removing Convex reactivity globally.
- Changing business logic for invoice math, AWB, or return definitions.

## 5) Product Strategy

Use a **hybrid data model**:

- Keep reactive queries for operational, rapidly-changing small payloads.
- Move report-style/heavy computations to **snapshot + on-demand refresh**.
- Return lighter projections and paginate aggressively.
- Pre-aggregate frequently computed analytics.

## 6) Proposed Solution (By Area)

### A. Invoices (`invoices.calculateInvoice`)

1. **Split invoice API into summary + breakdown pages**
   - New query: `invoices.getInvoiceSummary` (totals only).
   - New query: `invoices.getInvoiceSkuBreakdownPaginated` (cursor-based, e.g. 25 rows/page).
2. **Stop computing SKU breakdown from order snapshots**
   - Use `invoiceWorkedDailySku` + date range aggregation as primary source.
   - Keep fallback only for users not backfilled.
3. **Switch invoice screen from reactive-by-default to on-demand**
   - Use explicit refresh action/button for invoice recalculation.
   - Cache computed snapshot by `(userId, startDate, endDate)` with TTL (e.g. 15-60 min).
4. **Keep correctness guarantees**
   - Recompute snapshot when billing rate/packaging rules change.

Expected impact: biggest single reduction (likely >60% of total savings).

### B. Picking Lists (`pickingLists.getWithOrders`)

1. Replace full payload query with:
   - `pickingLists.getSummary` (metadata + counters)
   - `pickingLists.listOrdersPaginated` (light projection, 50/page)
2. Add order projection helper (same style as `orders.projectOrderForList`) for picking list rows.
3. Keep aggregated products in compact precomputed table keyed by list id, updated on add/remove order.
4. Avoid loading full list orders until table is visible and filters are applied.

Expected impact: very high reduction on picking-list pages and background reactive traffic.

### C. Orders list/search/stats

1. **`orders.listPaginated`**
   - Reduce initial page from 100 -> 30/50.
   - Ensure returned fields are list-only; fetch details only on edit/open.
2. **`orders.searchByText`**
   - Reduce fallback scan cap from 2000 -> 300-500.
   - Add `orderSearchTokens` table (denormalized searchable keys) for indexed search by:
     - normalized phone
     - tracking prefix
     - order number variants
     - key SKU tokens
3. **`orders.getStats`**
   - Read from `dailySales` + lightweight pending counters table.
   - Avoid scanning raw orders for periodic stats unless cache missing.

Expected impact: large reduction in recurring dashboard/order-page subscriptions.

### D. Analytics queries

1. Introduce `analyticsSnapshots` table keyed by:
   - `userId`
   - `shopDomain?`
   - `metricKey`
   - `periodKey`
2. Dashboard reads snapshots, not raw order scans.
3. Refresh triggers:
   - cron every 5-15 min
   - manual "Refresh analytics"
   - targeted refresh after order sync batch
4. For heavy all-time views, cap data windows and require explicit "Load all-time".

Expected impact: turns many high-bandwidth reactive scans into tiny reads.

### E. Frontend subscription policy

1. Define query classes:
   - **Live** (small, operational)
   - **Snapshot** (dashboard/reporting)
   - **On-demand** (invoice/export screens)
2. Limit concurrent heavy subscriptions per page.
3. Debounce and gate search requests more aggressively.
4. Avoid mounting expensive queries in hidden tabs/components.

## 7) Data Model Additions

- `invoiceSnapshots`
  - `userId`, `startDate`, `endDate`, `summary`, `generatedAt`, `expiresAt`, `version`
- `analyticsSnapshots`
  - `userId`, `shopDomain?`, `metricKey`, `periodKey`, `payload`, `generatedAt`, `expiresAt`
- `orderSearchTokens`
  - `userId`, `orderId`, `tokenType`, `tokenValue`, `updatedAt`
- `pickingListAggregates` (if not embedded in list table)
  - `pickingListId`, summary counters, product aggregates, `updatedAt`

## 8) Rollout Plan

### Phase 1 (2-3 days) - Quick wins

- Lower scan caps (`searchByText`, analytics fallbacks).
- Reduce initial order page size.
- Add lightweight projections where missing.
- Add dashboard manual refresh control for heavy metrics.

### Phase 2 (4-6 days) - Structural fixes

- Implement invoice split APIs and snapshot cache.
- Implement picking list summary + paginated orders APIs.
- Migrate frontend pages to new APIs.

### Phase 3 (3-5 days) - Durable optimization

- Implement analytics snapshots + refresh scheduler.
- Add search token table and migrate search fallback.
- Add observability dashboards + alert thresholds.

## 9) Success Metrics

Primary:

- Total Convex DB bandwidth/day reduced by >=70%.
- `invoices.calculateInvoice` daily reads reduced by >=90%.
- Top 10 function bandwidth distribution no longer dominated by a single query.

Secondary:

- P95 query latency does not regress.
- No invoice amount mismatches vs current logic.
- No increase in user-facing error rate.

## 10) Observability and Guardrails

- Weekly review of Convex “Breakdown by function” and “Database bandwidth”.
- Add lightweight logging for:
  - rows scanned
  - rows returned
  - payload size estimate (JSON length)
- Alert if any single query exceeds threshold (example: >100 MB/day sustained).
- Add regression tests for invoice totals and analytics totals against fixture data.

## 11) Risks & Mitigations

- **Risk:** stale snapshot data.
  - **Mitigation:** explicit refresh + TTL + timestamp shown in UI.
- **Risk:** migration bugs in invoice breakdown.
  - **Mitigation:** parallel-run old/new logic for selected users before cutover.
- **Risk:** more complex backend maintenance.
  - **Mitigation:** shared snapshot helpers and strict ownership per module.

## 12) Immediate Execution Checklist

- [ ] Create `invoiceSnapshots` and `analyticsSnapshots` schema.
- [ ] Implement `invoices.getInvoiceSummary` + `invoices.getInvoiceSkuBreakdownPaginated`.
- [ ] Replace `pickingLists.getWithOrders` usage with summary + paginated rows.
- [ ] Lower `orders.searchByText` fallback scan cap and add token-based lookup.
- [ ] Change dashboard heavy panels to snapshot-backed queries.
- [ ] Add bandwidth KPI review to weekly ops routine.

