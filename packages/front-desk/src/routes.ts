/**
 * Admin routes for the `pms-front-desk` module. Mounted at
 * `/v1/admin/pms/front-desk/*` (module name `pms/front-desk`). Thin routes:
 * parse, resolve db, call the service, serialize.
 *
 * Built by a factory so the deployment can inject the owned-stay write path
 * (`persistStayBooking`) the "New reservation" create route needs — this package
 * never imports app code (same inversion as `createChannelsModule`). The read /
 * ops routes take no deps.
 */

import type { VoyantDb, VoyantVariables } from "@voyant-travel/hono"
import { parseJsonBody, parseQuery } from "@voyant-travel/hono"
import { getUnitReadiness } from "@voyant-travel/pms-housekeeping"
import { Hono } from "hono"
import type { FrontDeskDb } from "./db.js"
import { getBoards } from "./service-boards.js"
import { checkIn, checkOut, noShow } from "./service-ops.js"
import {
  createReservation,
  type FrontDeskModuleDeps,
  getReservationAvailability,
} from "./service-reservations.js"
import { getTapeChart } from "./service-tape-chart.js"
import {
  availabilityRequestSchema,
  boardsQuerySchema,
  checkInSchema,
  checkOutSchema,
  createReservationSchema,
  noShowSchema,
  tapeChartQuerySchema,
} from "./validation.js"

type FrontDeskEnv = { Variables: VoyantVariables }

const dbOf = (db: VoyantDb): FrontDeskDb => db

export function createFrontDeskAdminRoutes(deps: FrontDeskModuleDeps) {
  return (
    new Hono<FrontDeskEnv>()
      // --- read screens ------------------------------------------------------
      .get("/tape-chart", async (c) =>
        c.json({
          data: await getTapeChart(dbOf(c.get("db")), parseQuery(c, tapeChartQuerySchema)),
        }),
      )
      .get("/boards", async (c) =>
        c.json({ data: await getBoards(dbOf(c.get("db")), parseQuery(c, boardsQuerySchema)) }),
      )
      // --- new reservation (availability + create) ---------------------------
      .post("/reservations/availability", async (c) =>
        c.json({
          data: await getReservationAvailability(
            dbOf(c.get("db")),
            await parseJsonBody(c, availabilityRequestSchema),
          ),
        }),
      )
      .post("/reservations", async (c) =>
        c.json({
          data: await createReservation(
            dbOf(c.get("db")),
            await parseJsonBody(c, createReservationSchema),
            deps,
            c.get("userId"),
          ),
        }),
      )
      // --- in-stay operations ------------------------------------------------
      .post("/check-in", async (c) =>
        c.json(
          await checkIn(dbOf(c.get("db")), await parseJsonBody(c, checkInSchema), c.get("userId"), {
            // Housekeeping readiness gating (front-desk → housekeeping): warns on a
            // dirty room or active maintenance block for the assigned unit.
            getUnitReadiness,
          }),
        ),
      )
      .post("/check-out", async (c) =>
        c.json(
          await checkOut(
            dbOf(c.get("db")),
            await parseJsonBody(c, checkOutSchema),
            c.get("userId"),
          ),
        ),
      )
      .post("/no-show", async (c) =>
        c.json(
          await noShow(dbOf(c.get("db")), await parseJsonBody(c, noShowSchema), c.get("userId")),
        ),
      )
  )
}

export type FrontDeskAdminRoutes = ReturnType<typeof createFrontDeskAdminRoutes>
