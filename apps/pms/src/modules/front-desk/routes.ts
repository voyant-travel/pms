/**
 * Admin routes for the `pms-front-desk` module. Mounted at
 * `/v1/admin/pms/front-desk/*` (module name `pms/front-desk`). Thin routes:
 * parse, resolve db, call the service, serialize.
 */

import type { VoyantDb, VoyantVariables } from "@voyant-travel/hono"
import { parseJsonBody, parseQuery } from "@voyant-travel/hono"
import { Hono } from "hono"

import type { FrontDeskDb } from "./db.js"
import { getBoards } from "./service-boards.js"
import { checkIn, checkOut, noShow } from "./service-ops.js"
import { getTapeChart } from "./service-tape-chart.js"
import {
  boardsQuerySchema,
  checkInSchema,
  checkOutSchema,
  noShowSchema,
  tapeChartQuerySchema,
} from "./validation.js"

type FrontDeskEnv = { Variables: VoyantVariables }

const dbOf = (db: VoyantDb): FrontDeskDb => db

export const frontDeskAdminRoutes = new Hono<FrontDeskEnv>()
  // --- read screens ----------------------------------------------------------
  .get("/tape-chart", async (c) =>
    c.json({ data: await getTapeChart(dbOf(c.get("db")), parseQuery(c, tapeChartQuerySchema)) }),
  )
  .get("/boards", async (c) =>
    c.json({ data: await getBoards(dbOf(c.get("db")), parseQuery(c, boardsQuerySchema)) }),
  )
  // --- in-stay operations ----------------------------------------------------
  .post("/check-in", async (c) =>
    c.json(
      await checkIn(dbOf(c.get("db")), await parseJsonBody(c, checkInSchema), c.get("userId")),
    ),
  )
  .post("/check-out", async (c) =>
    c.json(
      await checkOut(dbOf(c.get("db")), await parseJsonBody(c, checkOutSchema), c.get("userId")),
    ),
  )
  .post("/no-show", async (c) =>
    c.json(await noShow(dbOf(c.get("db")), await parseJsonBody(c, noShowSchema), c.get("userId"))),
  )

export type FrontDeskAdminRoutes = typeof frontDeskAdminRoutes
