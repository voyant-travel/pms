/**
 * Admin routes for the `pms-units` module. Mounted at `/v1/admin/pms/units/*`
 * (module name `pms/units`). Routes stay thin: parse via `parseJsonBody` /
 * `parseQuery`, resolve the request db, call the service, serialize.
 */

import type { VoyantDb, VoyantVariables } from "@voyant-travel/hono"
import { parseJsonBody, parseQuery } from "@voyant-travel/hono"
import { Hono } from "hono"

import type { UnitsDb } from "./db.js"
import { assignUnit, listAssignments, moveAssignment, unassign } from "./service-assignments.js"
import { recomputeDailyInventory } from "./service-inventory.js"
import {
  createRoomUnit,
  deleteRoomUnit,
  getRoomUnit,
  listRoomUnits,
  updateRoomUnit,
} from "./service-units.js"
import {
  assignmentListQuerySchema,
  insertAssignmentSchema,
  insertRoomUnitSchema,
  recomputeInventorySchema,
  roomUnitListQuerySchema,
  updateAssignmentSchema,
  updateRoomUnitSchema,
} from "./validation.js"

type UnitsEnv = { Variables: VoyantVariables }

const notFound = (entity: string) => ({ error: `${entity} not found` })
const dbOf = (db: VoyantDb): UnitsDb => db

export const unitsAdminRoutes = new Hono<UnitsEnv>()
  // --- room units ------------------------------------------------------------
  .get("/units", async (c) =>
    c.json(await listRoomUnits(dbOf(c.get("db")), parseQuery(c, roomUnitListQuerySchema))),
  )
  .post("/units", async (c) =>
    c.json(
      {
        data: await createRoomUnit(dbOf(c.get("db")), await parseJsonBody(c, insertRoomUnitSchema)),
      },
      201,
    ),
  )
  .get("/units/:id", async (c) => {
    const row = await getRoomUnit(dbOf(c.get("db")), c.req.param("id"))
    return row ? c.json({ data: row }) : c.json(notFound("Room unit"), 404)
  })
  .patch("/units/:id", async (c) => {
    const row = await updateRoomUnit(
      dbOf(c.get("db")),
      c.req.param("id"),
      await parseJsonBody(c, updateRoomUnitSchema),
    )
    return row ? c.json({ data: row }) : c.json(notFound("Room unit"), 404)
  })
  .delete("/units/:id", async (c) => {
    const row = await deleteRoomUnit(dbOf(c.get("db")), c.req.param("id"))
    return row ? c.json({ success: true }) : c.json(notFound("Room unit"), 404)
  })
  // --- serialized-inventory derivation ---------------------------------------
  .post("/room-types/:roomTypeId/recompute-inventory", async (c) => {
    const { from, to } = await parseJsonBody(c, recomputeInventorySchema)
    return c.json({
      data: await recomputeDailyInventory(dbOf(c.get("db")), c.req.param("roomTypeId"), from, to),
    })
  })
  // --- unit assignments ------------------------------------------------------
  .get("/assignments", async (c) =>
    c.json({
      data: await listAssignments(dbOf(c.get("db")), parseQuery(c, assignmentListQuerySchema)),
    }),
  )
  .post("/assignments", async (c) => {
    const result = await assignUnit(
      dbOf(c.get("db")),
      await parseJsonBody(c, insertAssignmentSchema),
      c.get("userId"),
    )
    return c.json(result, 201)
  })
  .patch("/assignments/:id", async (c) => {
    const result = await moveAssignment(
      dbOf(c.get("db")),
      c.req.param("id"),
      await parseJsonBody(c, updateAssignmentSchema),
    )
    return result ? c.json(result) : c.json(notFound("Assignment"), 404)
  })
  .delete("/assignments/:id", async (c) => {
    const row = await unassign(dbOf(c.get("db")), c.req.param("id"))
    return row ? c.json({ success: true }) : c.json(notFound("Assignment"), 404)
  })
  // Convenience: list assignments for a specific unit.
  .get("/units/:unitId/assignments", async (c) =>
    c.json({ data: await listAssignments(dbOf(c.get("db")), { unitId: c.req.param("unitId") }) }),
  )

export type UnitsAdminRoutes = typeof unitsAdminRoutes
