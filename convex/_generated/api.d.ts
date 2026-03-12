/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analyses from "../analyses.js";
import type * as analysisAction from "../analysisAction.js";
import type * as http from "../http.js";
import type * as lib from "../lib.js";
import type * as opinions from "../opinions.js";
import type * as rooms from "../rooms.js";
import type * as schemaReview from "../schemaReview.js";
import type * as shareAction from "../shareAction.js";
import type * as votes from "../votes.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analyses: typeof analyses;
  analysisAction: typeof analysisAction;
  http: typeof http;
  lib: typeof lib;
  opinions: typeof opinions;
  rooms: typeof rooms;
  schemaReview: typeof schemaReview;
  shareAction: typeof shareAction;
  votes: typeof votes;
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
