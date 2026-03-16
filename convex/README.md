# Convex Module Layout

This project keeps stable client API paths (for example `api.analytics.getDailySales`)
by using thin root files (like `convex/analytics.ts`) that re-export functions from
domain submodules.

## Rules

- Keep root module files as compatibility surfaces for public API names.
- Put implementation logic in `convex/<domain>/*.ts` split by concern.
- Prefer these buckets: `queries`, `mutations`, `actions`, `internal`, `shared/helpers`.
- Keep each implementation file under ~300-400 lines where possible.
- Keep `convex/http.ts`, `convex/crons.ts`, and `convex/schema.ts` as single entrypoints.

## Migration Log

### 2026-02-12

- Split `convex/analytics.ts` into:
  - `convex/analytics/overviewQueries.ts`
  - `convex/analytics/operationalQueries.ts`
  - `convex/analytics/skuQueries.ts`
  - `convex/analytics/mutations.ts`
  - `convex/analytics/productQueries.ts`
  - `convex/analytics/returnsQueries.ts`
  - `convex/analytics/shared.ts`
- Split `convex/auth.ts` into:
  - `convex/auth/authMutations.ts`
  - `convex/auth/admin.ts`
  - `convex/auth/userHelpers.ts`
  - `convex/auth/shared.ts`
- Split `convex/returns.ts` into:
  - `convex/returns/queries.ts`
  - `convex/returns/mutations.ts`
  - `convex/returns/internal.ts`
  - `convex/returns/actions.ts`
  - `convex/returns/shared.ts`
- Split `convex/sameday.ts` into:
  - `convex/sameday/shared.ts`
  - `convex/sameday/auth.ts`
  - `convex/sameday/geolocation.ts`
  - `convex/sameday/internalQueries.ts`
  - `convex/sameday/connectionActions.ts`
  - `convex/sameday/awbActions.ts`
  - `convex/sameday/awbStatusActions.ts`
  - `convex/sameday/syncActions.ts`
  - `convex/sameday/pdfActions.ts`
  - `convex/sameday/postalCodeActions.ts`
- Root files `convex/analytics.ts` and `convex/auth.ts` remain API-compatible re-export surfaces.
- Root files `convex/returns.ts` and `convex/sameday.ts` remain API-compatible re-export surfaces.

## Next Recommended Targets

- `convex/schema.ts`
- `convex/skus.ts`
- `convex/fgo.ts`
