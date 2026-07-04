/**
 * Admin routes for the `pms-housekeeping` module. Mounted at
 * `/v1/admin/pms/housekeeping/*` (module name `pms/housekeeping`). Routes stay
 * thin: parse via `parseJsonBody` / `parseQuery`, resolve the request db, call the
 * service, serialize.
 */

import type { VoyantDb, VoyantVariables } from "@voyant-travel/hono"
import { parseJsonBody, parseQuery } from "@voyant-travel/hono"
import { Hono } from "hono"
import { formatIsoDate } from "../units/dates.js"
import type { HousekeepingDb } from "./db.js"
import { generateTasksForDate } from "./service-generation.js"
import {
  cancelMaintenanceBlock,
  createMaintenanceBlock,
  getMaintenanceBlock,
  listMaintenanceBlocks,
  resolveMaintenanceBlock,
  updateMaintenanceBlock,
} from "./service-maintenance.js"
import { getUnitReadiness } from "./service-readiness.js"
import { listRoomStatusForProperty, setRoomStatus } from "./service-room-status.js"
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  setTaskStatus,
  updateTask,
} from "./service-tasks.js"
import {
  generateQuerySchema,
  insertMaintenanceBlockSchema,
  insertTaskSchema,
  maintenanceBlockListQuerySchema,
  readinessQuerySchema,
  roomStatusListQuerySchema,
  setRoomStatusSchema,
  taskListQuerySchema,
  taskStatusSchema,
  updateMaintenanceBlockSchema,
  updateTaskSchema,
} from "./validation.js"

type HousekeepingEnv = { Variables: VoyantVariables }

const notFound = (entity: string) => ({ error: `${entity} not found` })
const dbOf = (db: VoyantDb): HousekeepingDb => db

export const housekeepingAdminRoutes = new Hono<HousekeepingEnv>()
  // --- housekeeping tasks ----------------------------------------------------
  .get("/tasks", async (c) =>
    c.json(await listTasks(dbOf(c.get("db")), parseQuery(c, taskListQuerySchema))),
  )
  .post("/tasks", async (c) =>
    c.json(
      { data: await createTask(dbOf(c.get("db")), await parseJsonBody(c, insertTaskSchema)) },
      201,
    ),
  )
  .get("/tasks/:id", async (c) => {
    const row = await getTask(dbOf(c.get("db")), c.req.param("id"))
    return row ? c.json({ data: row }) : c.json(notFound("Task"), 404)
  })
  .patch("/tasks/:id", async (c) => {
    const row = await updateTask(
      dbOf(c.get("db")),
      c.req.param("id"),
      await parseJsonBody(c, updateTaskSchema),
    )
    return row ? c.json({ data: row }) : c.json(notFound("Task"), 404)
  })
  .delete("/tasks/:id", async (c) => {
    const row = await deleteTask(dbOf(c.get("db")), c.req.param("id"))
    return row ? c.json({ success: true }) : c.json(notFound("Task"), 404)
  })
  .post("/tasks/:id/status", async (c) => {
    const row = await setTaskStatus(
      dbOf(c.get("db")),
      c.req.param("id"),
      await parseJsonBody(c, taskStatusSchema),
      c.get("userId"),
    )
    return row ? c.json({ data: row }) : c.json(notFound("Task"), 404)
  })
  // --- room status -----------------------------------------------------------
  .get("/room-status", async (c) =>
    c.json({
      data: await listRoomStatusForProperty(
        dbOf(c.get("db")),
        parseQuery(c, roomStatusListQuerySchema).propertyId,
      ),
    }),
  )
  .post("/room-status", async (c) =>
    c.json({
      data: await setRoomStatus(
        dbOf(c.get("db")),
        await parseJsonBody(c, setRoomStatusSchema),
        c.get("userId"),
      ),
    }),
  )
  // --- auto-generation -------------------------------------------------------
  .post("/generate", async (c) => {
    const { propertyId, date } = parseQuery(c, generateQuerySchema)
    return c.json({ data: await generateTasksForDate(dbOf(c.get("db")), propertyId, date) })
  })
  // --- readiness (front-desk check-in gating seam) ---------------------------
  .get("/readiness", async (c) => {
    const { unitIds, date } = parseQuery(c, readinessQuerySchema)
    const on = date ?? formatIsoDate(new Date())
    return c.json({ data: await getUnitReadiness(dbOf(c.get("db")), unitIds, on) })
  })
  // --- maintenance blocks ----------------------------------------------------
  .get("/maintenance-blocks", async (c) =>
    c.json(
      await listMaintenanceBlocks(
        dbOf(c.get("db")),
        parseQuery(c, maintenanceBlockListQuerySchema),
      ),
    ),
  )
  .post("/maintenance-blocks", async (c) =>
    c.json(
      await createMaintenanceBlock(
        dbOf(c.get("db")),
        await parseJsonBody(c, insertMaintenanceBlockSchema),
        c.get("userId"),
      ),
      201,
    ),
  )
  .get("/maintenance-blocks/:id", async (c) => {
    const row = await getMaintenanceBlock(dbOf(c.get("db")), c.req.param("id"))
    return row ? c.json({ data: row }) : c.json(notFound("Maintenance block"), 404)
  })
  .patch("/maintenance-blocks/:id", async (c) => {
    const result = await updateMaintenanceBlock(
      dbOf(c.get("db")),
      c.req.param("id"),
      await parseJsonBody(c, updateMaintenanceBlockSchema),
    )
    return result ? c.json(result) : c.json(notFound("Maintenance block"), 404)
  })
  .post("/maintenance-blocks/:id/resolve", async (c) => {
    const result = await resolveMaintenanceBlock(dbOf(c.get("db")), c.req.param("id"))
    return result ? c.json(result) : c.json(notFound("Maintenance block"), 404)
  })
  .post("/maintenance-blocks/:id/cancel", async (c) => {
    const result = await cancelMaintenanceBlock(dbOf(c.get("db")), c.req.param("id"))
    return result ? c.json(result) : c.json(notFound("Maintenance block"), 404)
  })

export type HousekeepingAdminRoutes = typeof housekeepingAdminRoutes
