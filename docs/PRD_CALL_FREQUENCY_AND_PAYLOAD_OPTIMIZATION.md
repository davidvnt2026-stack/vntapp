# PRD: Convex Call Frequency + Payload Optimization

## 1) Problem Statement

The app still performs expensive Convex reads too often and/or reads too much per call on report-like screens.

Two separate problems must be solved together:

1. **Call frequency**: many views still use always-on reactive subscriptions (`useQuery`) when data only needs to load on tab open, filter apply, or explicit refresh.
2. **Payload size per call**: some queries return broad datasets even when UI needs only a subset.

Goal: keep full functional behavior (show full data when needed), but remove unnecessary background/reactive call churn and reduce bytes/docs read for the same UX.

---

## 2) Product Goals

- Reduce heavy-query invocation frequency by **70-90%** on non-realtime pages.
- Reduce bytes read per heavy call by **50-80%** where broad scans are not required.
- Preserve correctness: users still can fetch complete results (e.g., 200+ orders, full invoice details) when explicitly requested.
- Keep admin workflows fast; no hidden stale-data bugs.

---

## 3) Non-Goals

- No reduction of functional data completeness.
- No changes to business logic outputs.
- No forced real-time behavior removal for truly realtime areas (if explicitly required).

---

## 4) Audit Findings (Current App)

## High Priority Hotspots

- `src/pages/invoices/UserInvoiceDetail.tsx`
  - Uses reactive `useQuery` for billing/packaging settings and action snapshot for invoice.
  - Risk: page-enter and period-change still trigger full invoice recalculation path; detailed breakdown can be heavy.

- `src/pages/dashboard/DashboardPage.tsx`
  - Uses action snapshot (good), but aggregates many heavy queries behind one action.
  - Risk: call count reduced with cooldown, but payload remains large and all cards are always fetched together.

- `src/pages/stock/StockOrdersPage.tsx`
  - Loads many queries simultaneously on mount (`getSkuMetrics` x2, `getByMonthAll`, `getStatusDistribution`, etc.).
  - Risk: report/export data is fetched even before user asks for export.

- `src/pages/returns/ReturnsPage.tsx`
  - Search endpoints are reactive per keystroke (`useQuery` with length >= 2), no debounce gate.
  - Risk: high short-burst call volume during typing.

## Medium Priority Hotspots

- `src/pages/orders/OrdersPage.tsx`
  - Main list is paginated (good), but additional reactive queries run in parallel (`pickingLists`, fallback search, order mappings, stock helpers).
  - Risk: unnecessary reactive updates for report-like side data.

- `src/pages/stock/ItemsPage.tsx`
  - Multiple always-on queries (`listWithOverrides`, `getCategories`, `getLowStock`, `getBundles`, `settings`).
  - Risk: broad refreshes even when user only filters locally.

- `src/pages/stock/InboundStockPage.tsx`
  - Multiple list queries always mounted (`list`, `getPending`, `getInTransfer`, `getSuppliers`, `skus`).
  - Risk: reactive re-fetches for mostly operational, non-live dashboards.

## Lower Priority / Baseline

- `src/contexts/AuthContext.tsx`, `src/contexts/StoreContext.tsx`, `src/contexts/ImpersonationContext.tsx`
  - Global reactive auth/store/impersonation status queries.
  - Necessary, but should have stable minimal payloads and strict usage.

---

## 5) Principles for Fixes

- **Default policy**: non-realtime pages use **on-demand actions** or pull queries, not always-on subscriptions.
- **Fetch on user intent**: load data only on route entry, filter apply, expand panel, download action, or explicit refresh.
- **Separate summary vs detail**: summary loads first; detail (big tables/breakdowns) loads only when expanded.
- **Bound every expensive call**:
  - frontend gate (debounce/submit/manual apply),
  - backend cooldown cache (already started),
  - backend query shaping (indexes, projection, selective reads).

---

## 6) Solution Plan

## Phase A (Immediate, 1-2 days): Frequency Guards

1. **Returns search: submit/debounce gate**
   - Replace reactive `useQuery(api.returns.searchOrdersForReturn, ...)` typing behavior with:
     - 400-600ms debounce + minimum length 3, or explicit Search button trigger.
     - Use `useAction`/manual fetch for searches.
   - Expected: major reduction in burst calls while typing.

2. **Stock Orders page: lazy report data**
   - Do not fetch `reportSkuMetrics` + `reportMonthAllData` on initial page load.
   - Fetch only when user clicks `Download Full Report`.
   - Expected: substantial call and payload reduction on normal visits.

3. **Manual refresh policy**
   - Ensure refresh buttons are truly manual-only and do not auto-trigger equivalent calls in `useEffect`.
   - Keep forced refresh bypass explicit (`forceRefresh=true`) and only for user click.

4. **No hidden polling**
   - Keep polling disabled unless explicitly required and documented.

## Phase B (Core Refactor, 3-5 days): Replace Reactive on Heavy Screens

1. **Invoices split API**
   - Add lightweight `getInvoiceSummary` (totals only).
   - Add `getInvoiceSkuBreakdown` fetched only when details section is opened.
   - Keep full breakdown available, but not auto-fetched on initial entry.

2. **Dashboard card-level lazy loading**
   - Keep one snapshot for top summary cards.
   - Load heavy secondary widgets only when visible (or when user scrolls into section).
   - Option: split snapshot action into `summary` + `secondary`.

3. **Orders ancillary data non-reactive**
   - Move non-critical side queries (e.g. mappings/search fallback) to on-demand where possible.
   - Keep primary order list fast and paginated.

## Phase C (Payload Optimization, 3-5 days): Query Shape + Data Model

1. **Selective backend reads**
   - Continue targeted index-based reads (already started for invoice SKU daily rows).
   - Add projection-focused list queries where only small fields are needed.

2. **Summary materialization**
   - Precompute dashboard and invoice summary aggregates (daily or on mutation events).
   - Heavy detail queries should compose from compact aggregate tables first.

3. **Response shaping**
   - Return only fields needed by the active UI section.
   - Avoid full-document lists for list views.

---

## 7) Concrete Per-File Worklist

- `src/pages/returns/ReturnsPage.tsx`
  - Convert search `useQuery` to manual action/query-on-submit.
  - Add debounce and "searchTermSubmitted" state.

- `src/pages/stock/StockOrdersPage.tsx`
  - Gate `reportSkuMetrics` / `reportMonthAllData` behind download action.
  - Fetch `statusDistribution` only after user presses Apply (already close; keep strict).

- `src/pages/invoices/UserInvoiceDetail.tsx`
  - Load summary first; fetch SKU breakdown on details expand.
  - Keep billing/package settings but consider non-reactive refresh after mutation.

- `src/pages/dashboard/DashboardPage.tsx`
  - Split snapshot into minimal + extended sections.
  - Load extended cards lazily.

- `src/pages/orders/OrdersPage.tsx`
  - Re-evaluate each helper query for reactivity necessity.
  - Keep `usePaginatedQuery` for main grid; reduce parallel reactive side data.

- `src/pages/stock/ItemsPage.tsx`
  - Fetch low-stock/bundles/settings on demand or with longer cache TTL policy.

- `src/pages/stock/InboundStockPage.tsx`
  - Consolidate list + pending + transfer counts into one snapshot endpoint where practical.

---

## 8) Technical Standards

- Introduce a small shared hook pattern:
  - `useManualSnapshot(fetcher, key, ttlMs)`
  - features: in-flight dedupe, route-level cache TTL, explicit `refresh(force)`.

- Query rules:
  - No heavy `useQuery` unless feature is explicitly real-time.
  - Any query expected to read >1000 docs must have:
    - index strategy documented,
    - pagination/partitioning strategy,
    - reason for full scan if unavoidable.

---

## 9) Observability & Success Metrics

Track before/after in Convex dashboard:

- Function calls/day for:
  - `invoices:calculateInvoice`
  - `dashboard:getSnapshotData`
  - `orders:getStats`
  - `analytics:*` dashboard functions
  - `returns:searchOrdersForReturn`
- Avg and p95 bytes read/function.
- Avg and p95 docs read/function.

Acceptance targets:

- Heavy report endpoints are not called in background while user is idle on unrelated pages.
- Typing in search does not produce unbounded query spam.
- Invoice and dashboard heavy reads drop significantly from current baseline.

---

## 10) Rollout Strategy

1. Feature flags for each refactor area (`returnsSearchManual`, `stockReportLazy`, `invoiceSplit`, `dashboardSplit`).
2. Deploy in slices, monitor insights/logs 24h per slice.
3. Roll back per feature flag if regressions appear.

---

## 11) Risks & Mitigations

- **Risk**: stale UI due to reduced reactivity.
  - Mitigation: visible `Updated at`, explicit refresh, post-mutation local refresh.

- **Risk**: user confusion after moving to manual load.
  - Mitigation: loading states + clear action buttons (Apply/Load details/Refresh).

- **Risk**: partial rollout complexity.
  - Mitigation: feature flags + narrow scoped PRs + telemetry checkpoints.

---

## 12) Deliverables

- PR set A: frequency guard changes.
- PR set B: invoice/dashboard split-fetch refactor.
- PR set C: backend payload/index optimizations and aggregate shaping.
- Post-rollout report with function-level bandwidth/call diffs.

