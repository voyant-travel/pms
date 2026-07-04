/**
 * Admin routes for the `pms-folios` module. Mounted at `/v1/admin/pms/folios/*`
 * (module name `pms/folios`). Thin routes: parse via `parseJsonBody` /
 * `parseQuery`, resolve the request db, call the service, serialize. Postings are
 * immutable — there is no PATCH/DELETE on a posting, only appends (post / transfer
 * / void).
 */

import type { VoyantDb, VoyantVariables } from "@voyant-travel/hono"
import { parseJsonBody, parseQuery } from "@voyant-travel/hono"
import { Hono } from "hono"

import type { FoliosDb } from "./db.js"
import { getFolioWithPostings, listFolios, openFolio } from "./service-folios.js"
import { runNightAudit } from "./service-night-audit.js"
import { createPosting, transferPosting, voidPosting } from "./service-postings.js"
import { getDailyReport } from "./service-reports.js"
import { closeFolio, settleFolio } from "./service-settlement.js"
import {
  createPostingSchema,
  dailyReportQuerySchema,
  folioListQuerySchema,
  nightAuditQuerySchema,
  openFolioSchema,
  settleFolioSchema,
  transferPostingSchema,
} from "./validation.js"

type FoliosEnv = { Variables: VoyantVariables }

const notFound = (entity: string) => ({ error: `${entity} not found` })
const dbOf = (db: VoyantDb): FoliosDb => db

export const foliosAdminRoutes = new Hono<FoliosEnv>()
  // --- folios ----------------------------------------------------------------
  .get("/folios", async (c) =>
    c.json(await listFolios(dbOf(c.get("db")), parseQuery(c, folioListQuerySchema))),
  )
  .post("/folios", async (c) =>
    c.json(
      { data: await openFolio(dbOf(c.get("db")), await parseJsonBody(c, openFolioSchema)) },
      201,
    ),
  )
  .get("/folios/:id", async (c) => {
    const result = await getFolioWithPostings(dbOf(c.get("db")), c.req.param("id"))
    return result ? c.json({ data: result }) : c.json(notFound("Folio"), 404)
  })
  // --- postings (append-only) ------------------------------------------------
  .post("/folios/:id/postings", async (c) =>
    c.json(
      {
        data: await createPosting(
          dbOf(c.get("db")),
          c.req.param("id"),
          await parseJsonBody(c, createPostingSchema),
          c.get("userId"),
        ),
      },
      201,
    ),
  )
  .post("/folios/:id/transfer", async (c) =>
    c.json({
      data: await transferPosting(
        dbOf(c.get("db")),
        c.req.param("id"),
        await parseJsonBody(c, transferPostingSchema),
        c.get("userId"),
      ),
    }),
  )
  .post("/postings/:id/void", async (c) =>
    c.json({ data: await voidPosting(dbOf(c.get("db")), c.req.param("id"), c.get("userId")) }),
  )
  // --- settlement ------------------------------------------------------------
  .post("/folios/:id/settle", async (c) =>
    c.json({
      data: await settleFolio(
        dbOf(c.get("db")),
        c.req.param("id"),
        await parseJsonBody(c, settleFolioSchema),
      ),
    }),
  )
  .post("/folios/:id/close", async (c) =>
    c.json({ data: await closeFolio(dbOf(c.get("db")), c.req.param("id")) }),
  )
  // --- night audit -----------------------------------------------------------
  .post("/night-audit/run", async (c) => {
    const { propertyId } = parseQuery(c, nightAuditQuerySchema)
    return c.json({ data: await runNightAudit(dbOf(c.get("db")), propertyId) })
  })
  // --- reports ---------------------------------------------------------------
  .get("/reports/daily", async (c) => {
    const { propertyId, date } = parseQuery(c, dailyReportQuerySchema)
    return c.json({ data: await getDailyReport(dbOf(c.get("db")), propertyId, date) })
  })

export type FoliosAdminRoutes = typeof foliosAdminRoutes
