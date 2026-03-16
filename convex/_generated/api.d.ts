/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analytics from "../analytics.js";
import type * as analyticsSnapshots from "../analyticsSnapshots.js";
import type * as analytics_mutations from "../analytics/mutations.js";
import type * as analytics_operationalQueries from "../analytics/operationalQueries.js";
import type * as analytics_overviewQueries from "../analytics/overviewQueries.js";
import type * as analytics_productQueries from "../analytics/productQueries.js";
import type * as analytics_returnsQueries from "../analytics/returnsQueries.js";
import type * as analytics_shared from "../analytics/shared.js";
import type * as analytics_skuQueries from "../analytics/skuQueries.js";
import type * as auth from "../auth.js";
import type * as auth_admin from "../auth/admin.js";
import type * as auth_authMutations from "../auth/authMutations.js";
import type * as auth_shared from "../auth/shared.js";
import type * as auth_userHelpers from "../auth/userHelpers.js";
import type * as awb from "../awb.js";
import type * as connections from "../connections.js";
import type * as courierRevenue from "../courierRevenue.js";
import type * as courierSummaryFiles from "../courierSummaryFiles.js";
import type * as courierSummaryWebhook from "../courierSummaryWebhook.js";
import type * as crons from "../crons.js";
import type * as dailyStock from "../dailyStock.js";
import type * as dashboard from "../dashboard.js";
import type * as errors from "../errors.js";
import type * as externalAwb from "../externalAwb.js";
import type * as fgo from "../fgo.js";
import type * as http from "../http.js";
import type * as inboundStock from "../inboundStock.js";
import type * as invoiceSnapshots from "../invoiceSnapshots.js";
import type * as invoices from "../invoices.js";
import type * as orders from "../orders.js";
import type * as pickingLists from "../pickingLists.js";
import type * as returns from "../returns.js";
import type * as returns_actions from "../returns/actions.js";
import type * as returns_internal from "../returns/internal.js";
import type * as returns_mutations from "../returns/mutations.js";
import type * as returns_queries from "../returns/queries.js";
import type * as returns_shared from "../returns/shared.js";
import type * as sameday from "../sameday.js";
import type * as sameday_auth from "../sameday/auth.js";
import type * as sameday_awbActions from "../sameday/awbActions.js";
import type * as sameday_awbStatusActions from "../sameday/awbStatusActions.js";
import type * as sameday_connectionActions from "../sameday/connectionActions.js";
import type * as sameday_geolocation from "../sameday/geolocation.js";
import type * as sameday_internalQueries from "../sameday/internalQueries.js";
import type * as sameday_pdfActions from "../sameday/pdfActions.js";
import type * as sameday_postalCodeActions from "../sameday/postalCodeActions.js";
import type * as sameday_searchCityAction from "../sameday/searchCityAction.js";
import type * as sameday_shared from "../sameday/shared.js";
import type * as sameday_syncActions from "../sameday/syncActions.js";
import type * as sameday_validateAddressAction from "../sameday/validateAddressAction.js";
import type * as settings from "../settings.js";
import type * as shopify from "../shopify.js";
import type * as shopifyOauth from "../shopifyOauth.js";
import type * as skus from "../skus.js";
import type * as snapshotCache from "../snapshotCache.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  analyticsSnapshots: typeof analyticsSnapshots;
  "analytics/mutations": typeof analytics_mutations;
  "analytics/operationalQueries": typeof analytics_operationalQueries;
  "analytics/overviewQueries": typeof analytics_overviewQueries;
  "analytics/productQueries": typeof analytics_productQueries;
  "analytics/returnsQueries": typeof analytics_returnsQueries;
  "analytics/shared": typeof analytics_shared;
  "analytics/skuQueries": typeof analytics_skuQueries;
  auth: typeof auth;
  "auth/admin": typeof auth_admin;
  "auth/authMutations": typeof auth_authMutations;
  "auth/shared": typeof auth_shared;
  "auth/userHelpers": typeof auth_userHelpers;
  awb: typeof awb;
  connections: typeof connections;
  courierRevenue: typeof courierRevenue;
  courierSummaryFiles: typeof courierSummaryFiles;
  courierSummaryWebhook: typeof courierSummaryWebhook;
  crons: typeof crons;
  dailyStock: typeof dailyStock;
  dashboard: typeof dashboard;
  errors: typeof errors;
  externalAwb: typeof externalAwb;
  fgo: typeof fgo;
  http: typeof http;
  inboundStock: typeof inboundStock;
  invoiceSnapshots: typeof invoiceSnapshots;
  invoices: typeof invoices;
  orders: typeof orders;
  pickingLists: typeof pickingLists;
  returns: typeof returns;
  "returns/actions": typeof returns_actions;
  "returns/internal": typeof returns_internal;
  "returns/mutations": typeof returns_mutations;
  "returns/queries": typeof returns_queries;
  "returns/shared": typeof returns_shared;
  sameday: typeof sameday;
  "sameday/auth": typeof sameday_auth;
  "sameday/awbActions": typeof sameday_awbActions;
  "sameday/awbStatusActions": typeof sameday_awbStatusActions;
  "sameday/connectionActions": typeof sameday_connectionActions;
  "sameday/geolocation": typeof sameday_geolocation;
  "sameday/internalQueries": typeof sameday_internalQueries;
  "sameday/pdfActions": typeof sameday_pdfActions;
  "sameday/postalCodeActions": typeof sameday_postalCodeActions;
  "sameday/searchCityAction": typeof sameday_searchCityAction;
  "sameday/shared": typeof sameday_shared;
  "sameday/syncActions": typeof sameday_syncActions;
  "sameday/validateAddressAction": typeof sameday_validateAddressAction;
  settings: typeof settings;
  shopify: typeof shopify;
  shopifyOauth: typeof shopifyOauth;
  skus: typeof skus;
  snapshotCache: typeof snapshotCache;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
