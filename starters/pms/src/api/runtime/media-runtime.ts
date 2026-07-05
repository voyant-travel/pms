/**
 * Operator (deployment) wiring for the media routes.
 *
 * The route SHAPES live in packages:
 *   - upload + serve in `@voyant-travel/storage` (`createMediaRoutes`),
 *   - product brochure generation in `@voyant-travel/inventory`
 *     (`createProductBrochureRoutes`).
 *
 * This file supplies the deployment-specific access those packages can't import
 * statically:
 *   - the R2-backed `StorageProvider` (`./lib/storage` → `createMediaStorage`),
 *   - the video upload ticket signer (`../lib/video-uploads`),
 *   - the Voyant Cloud browser printer for brochures (`../lib/brochure-printer`,
 *     only when Cloud is configured).
 *
 * Swapping storage backends, the video provider, or the brochure printer is a
 * change here — never in the route implementations.
 */

import { OpenAPIHono } from "@hono/zod-openapi"
import { createProductBrochureRoutes } from "@voyant-travel/inventory/routes-brochure"
import { createMediaRoutes, type VideoUploadTicketRequest } from "@voyant-travel/storage/routes"
import type { Context } from "hono"

import { createProductBrochurePrinter } from "../../lib/brochure-printer"
import { createVideoUploadTicket } from "../../lib/video-uploads"
import { tryGetCloudClient } from "../../lib/voyant-cloud"
import { createMediaStorage, guessMimeType } from "../lib/storage"

/** Resolve the R2-backed media storage provider for a request (or null → 503). */
function resolveStorage(c: Context) {
  return createMediaStorage(c.env)
}

/** Build the upload + serve routes (`/v1/admin/uploads`, `/v1/admin/media/*`, …). */
function buildMediaUploadAndServeRoutes() {
  return createMediaRoutes({
    resolveStorage,
    guessServedMimeType: guessMimeType,
    signVideoUploadTicket: (c: Context, input: VideoUploadTicketRequest) =>
      createVideoUploadTicket(c.env, input),
  })
}

/** Build the brochure route (`/v1/admin/products/:id/brochure/generate`). */
function buildBrochureRoutes() {
  return createProductBrochureRoutes({
    resolveStorage,
    // Use the Voyant Cloud browser printer only when Cloud is configured;
    // otherwise the task falls back to its built-in pdf-lib printer.
    resolvePrinter: (c: Context) =>
      tryGetCloudClient(c.env) ? createProductBrochurePrinter(c.env) : null,
  })
}

/**
 * The combined media route surface for the operator — upload + serve (from
 * storage) and brochure generation (from inventory), wired with this
 * deployment's options. Brochure routes mount under `/v1/admin/products`; the
 * media routes already register absolute paths.
 */
export function buildOperatorMediaRoutes(): OpenAPIHono {
  // OpenAPIHono parent so the brochure-generation sub-app's `.openapi()` def
  // (`POST /v1/admin/products/{id}/brochure/generate`) surfaces in the operator
  // spec via the build-time lazy-merge — `mergeLazyOpenApiPaths` skips plain
  // `Hono` wrappers, which carry no registry (voyant#2114). The upload + binary
  // serve routes from `@voyant-travel/storage` stay plain `Hono` (multipart /
  // wildcard byte streams), so they remain undocumented.
  const app = new OpenAPIHono()
  app.route("/", buildMediaUploadAndServeRoutes())
  app.route("/v1/admin/products", buildBrochureRoutes())
  return app
}
