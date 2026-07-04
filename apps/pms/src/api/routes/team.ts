/**
 * Cloud-mode team management.
 *
 * When the operator runs in `voyant-cloud` admin-auth mode the team roster
 * lives on the Voyant Cloud platform, not in this deployment's DB — so the
 * local `/v1/admin/invitations` surface (which mints local credential users)
 * can't manage who actually signs in. These routes proxy member management to
 * the platform via the deployment's client credential, scoped to this
 * deployment's app (RFC: deployment member mgmt / option C).
 *
 * They are cloud-only: in local auth mode they return 404 and the local
 * invitations surface remains the way to manage users. The acting staff user's
 * WorkOS id is resolved from `cloud_auth_user_links`; the platform re-verifies
 * that user is an org manager before mutating, so this deployment never
 * self-asserts authority.
 */

import {
  type CloudAdminMembersConfig,
  CloudAdminMembersError,
  cloudAdminMembersConfigFromRevalidate,
  inviteCloudAdminMember,
  listCloudAdminInvitations,
  listCloudAdminMemberRoles,
  listCloudAdminMembers,
  revokeCloudAdminInvitation,
  setCloudAdminMemberAccess,
  setCloudAdminMemberPermissions,
} from "@voyant-travel/auth/cloud-broker"
import { cloudAuthUserLinks } from "@voyant-travel/db/schema/iam"
import type { VoyantDb } from "@voyant-travel/hono"
import { eq } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { z } from "zod"

type TeamBindings = CloudflareBindings
type TeamVariables = {
  userId?: string
  db: VoyantDb
}

const inviteSchema = z.object({
  email: z.string().email(),
  roleSlug: z.string().trim().min(1).max(120).optional().nullable(),
  expiresInDays: z.number().int().min(1).max(30).optional(),
})

const accessSchema = z.object({
  hasAccess: z.boolean(),
})

const permissionsSchema = z.object({
  permissions: z.array(z.string().trim().min(1).max(120)).max(200),
})

function isCloudAuthMode(env: TeamBindings): boolean {
  return env.VOYANT_ADMIN_AUTH_MODE?.trim() === "voyant-cloud"
}

function resolveMembersConfig(env: TeamBindings): CloudAdminMembersConfig | null {
  const deploymentId = env.VOYANT_CLOUD_DEPLOYMENT_ID?.trim()
  const revalidateUrl = env.VOYANT_CLOUD_ADMIN_AUTH_REVALIDATE_URL?.trim()
  const clientToken = env.VOYANT_CLOUD_ADMIN_AUTH_CLIENT_TOKEN?.trim()
  if (!deploymentId || !revalidateUrl || !clientToken) return null

  return cloudAdminMembersConfigFromRevalidate({
    revalidateUrl,
    deploymentId,
    clientToken,
  })
}

/** The WorkOS user id behind the current Better Auth session, or null. */
async function resolveActingWorkosUserId(db: VoyantDb, userId: string): Promise<string | null> {
  const [link] = await db
    .select({ providerAccountId: cloudAuthUserLinks.providerAccountId })
    .from(cloudAuthUserLinks)
    .where(eq(cloudAuthUserLinks.userId, userId))
    .limit(1)
  return link?.providerAccountId ?? null
}

type TeamContext = {
  config: CloudAdminMembersConfig
  actingWorkosUserId: string
}

type TeamCtx = Context<{ Bindings: TeamBindings; Variables: TeamVariables }>

export function createTeamAdminRoutes() {
  const routes = new Hono<{ Bindings: TeamBindings; Variables: TeamVariables }>()

  /**
   * Shared guard: cloud-mode only, authenticated, and the session resolves to a
   * WorkOS identity. Returns the proxy context or a `Response` to short-circuit.
   */
  const resolveContext = async (c: TeamCtx): Promise<TeamContext | Response> => {
    if (!isCloudAuthMode(c.env)) {
      return c.json({ error: "Not found" }, 404)
    }

    const userId = c.get("userId")
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401)
    }

    const config = resolveMembersConfig(c.env)
    if (!config) {
      return c.json({ error: "Voyant Cloud member management is not configured" }, 501)
    }

    const actingWorkosUserId = await resolveActingWorkosUserId(c.get("db"), userId)
    if (!actingWorkosUserId) {
      return c.json({ error: "No Voyant Cloud identity for this session" }, 403)
    }

    return { config, actingWorkosUserId }
  }

  /** Translate a platform member error into the matching HTTP response. */
  const handleError = (c: TeamCtx, error: unknown): Response => {
    if (error instanceof CloudAdminMembersError) {
      return c.json({ error: error.reason ?? error.message }, error.status as 403)
    }
    throw error
  }

  routes.get("/members", async (c) => {
    const ctx = await resolveContext(c)
    if (ctx instanceof Response) return ctx
    try {
      const data = await listCloudAdminMembers(ctx)
      return c.json({ data })
    } catch (error) {
      return handleError(c, error)
    }
  })

  routes.get("/roles", async (c) => {
    const ctx = await resolveContext(c)
    if (ctx instanceof Response) return ctx
    try {
      const data = await listCloudAdminMemberRoles(ctx)
      return c.json({ data })
    } catch (error) {
      return handleError(c, error)
    }
  })

  routes.get("/invitations", async (c) => {
    const ctx = await resolveContext(c)
    if (ctx instanceof Response) return ctx
    try {
      const data = await listCloudAdminInvitations(ctx)
      return c.json({ data })
    } catch (error) {
      return handleError(c, error)
    }
  })

  routes.post("/invitations", async (c) => {
    const ctx = await resolveContext(c)
    if (ctx instanceof Response) return ctx

    const parsed = inviteSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: "Invalid payload", details: parsed.error.issues }, 400)
    }

    try {
      const data = await inviteCloudAdminMember({ ...ctx, input: parsed.data })
      return c.json({ data }, 201)
    } catch (error) {
      return handleError(c, error)
    }
  })

  routes.delete("/invitations/:invitationId", async (c) => {
    const ctx = await resolveContext(c)
    if (ctx instanceof Response) return ctx
    try {
      await revokeCloudAdminInvitation({
        ...ctx,
        invitationId: c.req.param("invitationId"),
      })
      return c.body(null, 204)
    } catch (error) {
      return handleError(c, error)
    }
  })

  routes.put("/members/:membershipId/access", async (c) => {
    const ctx = await resolveContext(c)
    if (ctx instanceof Response) return ctx

    const parsed = accessSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: "Invalid payload", details: parsed.error.issues }, 400)
    }

    try {
      const data = await setCloudAdminMemberAccess({
        ...ctx,
        membershipId: c.req.param("membershipId"),
        hasAccess: parsed.data.hasAccess,
      })
      return c.json({ data })
    } catch (error) {
      return handleError(c, error)
    }
  })

  routes.put("/members/:membershipId/permissions", async (c) => {
    const ctx = await resolveContext(c)
    if (ctx instanceof Response) return ctx

    const parsed = permissionsSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: "Invalid payload", details: parsed.error.issues }, 400)
    }

    try {
      const data = await setCloudAdminMemberPermissions({
        ...ctx,
        membershipId: c.req.param("membershipId"),
        permissions: parsed.data.permissions,
      })
      return c.json({ data })
    } catch (error) {
      return handleError(c, error)
    }
  })

  return routes
}
