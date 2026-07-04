/**
 * Admin-issued user invitations.
 *
 * Flow:
 *  1. An existing super-admin POSTs /v1/admin/invitations with an email.
 *  2. We mint a random 32-byte token, store only its SHA-256 hash, and
 *     (optionally) email the invitee a link containing the raw token.
 *  3. The invitee opens /accept-invite?token=…, enters a name + password.
 *  4. /v1/public/invitations/:token/redeem does raw Drizzle inserts for
 *     `user`, `account` (scrypt-hashed password), and `user_profiles`,
 *     bypassing Better Auth's `user.create.before` hook (which would
 *     otherwise block sign-ups now that we have users). Then we open a
 *     Better Auth session via signInEmail and forward the cookie.
 */

import { newId } from "@voyant-travel/db/lib/typeid"
import {
  authAccount,
  authUser,
  userInvitationsTable,
  userProfilesTable,
} from "@voyant-travel/db/schema/iam"
import type { VoyantDb } from "@voyant-travel/hono"
import { hashPassword } from "better-auth/crypto"
import { and, desc, eq, gt, isNull } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"

import { resolveEmailReplyTo } from "../../lib/notifications"
import { tryGetCloudClient } from "../../lib/voyant-cloud"
import { withDbFromEnv } from "../lib/db"

type InvitationsBindings = CloudflareBindings
type InvitationsVariables = {
  userId?: string
  db: VoyantDb
}

const DEFAULT_EXPIRY_HOURS = 72

const createInviteSchema = z.object({
  email: z.string().email(),
  expiresInHours: z
    .number()
    .int()
    .positive()
    .max(24 * 30)
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const redeemInviteSchema = z.object({
  name: z.string().min(1).max(200),
  password: z.string().min(8).max(128),
})

function randomTokenBase64Url(bytes: number): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  let binary = ""
  for (const b of buf) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function getAppUrl(env: InvitationsBindings): string {
  const fromEnv = env.APP_URL || env.DASH_BASE_URL
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim().replace(/\/$/, "")
  return "http://localhost:3300"
}

async function assertSuperAdmin(env: InvitationsBindings, userId: string): Promise<boolean> {
  // `withDbFromEnv` owns the per-call Pool — opens, runs the query,
  // closes in `finally`. Avoids the leak that would happen with a bare
  // `getDbFromEnv(env)` here (no Hono ctx ⇒ no `c.var.db` to ride on).
  return withDbFromEnv(env, async (db) => {
    const [row] = await db
      .select({ isSuperAdmin: userProfilesTable.isSuperAdmin })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.id, userId))
      .limit(1)
    return !!row?.isSuperAdmin
  })
}

export function createInvitationsAdminRoutes() {
  const routes = new Hono<{ Bindings: InvitationsBindings; Variables: InvitationsVariables }>()

  // ---------- Admin: list active invitations ----------
  routes.get("/", async (c) => {
    const userId = c.get("userId")
    if (!userId || !(await assertSuperAdmin(c.env, userId))) {
      return c.json({ error: "Forbidden" }, 403)
    }

    const db = c.get("db")
    const rows = await db
      .select({
        id: userInvitationsTable.id,
        email: userInvitationsTable.email,
        expiresAt: userInvitationsTable.expiresAt,
        redeemedAt: userInvitationsTable.redeemedAt,
        createdBy: userInvitationsTable.createdBy,
        createdAt: userInvitationsTable.createdAt,
      })
      .from(userInvitationsTable)
      .orderBy(desc(userInvitationsTable.createdAt))
      .limit(100)

    return c.json({ data: rows })
  })

  // ---------- Admin: create invitation ----------
  routes.post("/", async (c) => {
    const userId = c.get("userId")
    if (!userId || !(await assertSuperAdmin(c.env, userId))) {
      return c.json({ error: "Forbidden" }, 403)
    }

    const body = await c.req.json().catch(() => null)
    const parsed = createInviteSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: "Invalid payload", details: parsed.error.issues }, 400)
    }

    const db = c.get("db")
    const normalizedEmail = parsed.data.email.trim().toLowerCase()

    // If this email already has a BA user, block the invite.
    const [existingUser] = await db
      .select({ id: authUser.id })
      .from(authUser)
      .where(eq(authUser.email, normalizedEmail))
      .limit(1)
    if (existingUser) {
      return c.json({ error: "A user with this email already exists." }, 409)
    }

    const rawToken = randomTokenBase64Url(32)
    const tokenHash = await sha256Hex(rawToken)
    const hours = parsed.data.expiresInHours ?? DEFAULT_EXPIRY_HOURS
    const expiresAt = new Date(Date.now() + hours * 3600 * 1000)

    const id = newId("user_invitations")
    await db.insert(userInvitationsTable).values({
      id,
      email: normalizedEmail,
      tokenHash,
      expiresAt,
      createdBy: userId,
      metadata: parsed.data.metadata ?? null,
    })

    const appUrl = getAppUrl(c.env)
    const acceptUrl = `${appUrl}/accept-invite?token=${encodeURIComponent(rawToken)}`

    // Best-effort email. If Voyant Cloud isn't configured (no key), we return
    // the link so the admin can hand-deliver it (useful in dev).
    let emailSent = false
    const cloud = tryGetCloudClient(c.env)
    if (cloud) {
      try {
        const from = c.env.EMAIL_FROM || "Voyant <noreply@voyantcloud.app>"
        const replyTo = resolveEmailReplyTo(c.env)
        await cloud.email.sendMessage({
          from,
          to: [normalizedEmail],
          subject: "You've been invited to Voyant",
          html: `<p>You've been invited to join a Voyant workspace.</p><p><a href="${acceptUrl}">Accept invitation</a></p><p>The link expires in ${hours} hours.</p>`,
          ...(replyTo ? { replyTo } : {}),
        })
        emailSent = true
      } catch (error) {
        console.error("[invitations] voyant-cloud send failed:", error)
      }
    }

    return c.json({
      data: {
        id,
        email: normalizedEmail,
        expiresAt: expiresAt.toISOString(),
        acceptUrl,
        emailSent,
      },
    })
  })

  // ---------- Admin: revoke invitation ----------
  routes.delete("/:id", async (c) => {
    const userId = c.get("userId")
    if (!userId || !(await assertSuperAdmin(c.env, userId))) {
      return c.json({ error: "Forbidden" }, 403)
    }

    const id = c.req.param("id")
    const db = c.get("db")
    await db.delete(userInvitationsTable).where(eq(userInvitationsTable.id, id))
    return c.json({ data: { id } })
  })

  return routes
}

export function createInvitationsPublicRoutes() {
  const routes = new Hono<{ Bindings: InvitationsBindings; Variables: InvitationsVariables }>()

  // ---------- Public: inspect invitation ----------
  routes.get("/:token", async (c) => {
    const token = c.req.param("token")
    const tokenHash = await sha256Hex(token)
    const db = c.get("db")

    const [row] = await db
      .select({
        email: userInvitationsTable.email,
        expiresAt: userInvitationsTable.expiresAt,
        redeemedAt: userInvitationsTable.redeemedAt,
      })
      .from(userInvitationsTable)
      .where(eq(userInvitationsTable.tokenHash, tokenHash))
      .limit(1)

    if (!row) return c.json({ valid: false, reason: "not_found" }, 404)
    if (row.redeemedAt) return c.json({ valid: false, reason: "redeemed" }, 410)
    if (row.expiresAt.getTime() < Date.now()) {
      return c.json({ valid: false, reason: "expired" }, 410)
    }

    return c.json({
      valid: true,
      email: row.email,
      expiresAt: row.expiresAt.toISOString(),
    })
  })

  // ---------- Public: redeem invitation ----------
  routes.post("/:token/redeem", async (c) => {
    const token = c.req.param("token")
    const parsed = redeemInviteSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: "Invalid payload", details: parsed.error.issues }, 400)
    }

    const tokenHash = await sha256Hex(token)
    const db = c.get("db")
    const now = new Date()

    const [invite] = await db
      .select()
      .from(userInvitationsTable)
      .where(
        and(
          eq(userInvitationsTable.tokenHash, tokenHash),
          isNull(userInvitationsTable.redeemedAt),
          gt(userInvitationsTable.expiresAt, now),
        ),
      )
      .limit(1)

    if (!invite) {
      return c.json({ error: "Invitation is invalid, expired, or already redeemed." }, 410)
    }

    // Refuse if a user with this email was created between invitation and redemption.
    const [existingUser] = await db
      .select({ id: authUser.id })
      .from(authUser)
      .where(eq(authUser.email, invite.email))
      .limit(1)
    if (existingUser) {
      return c.json({ error: "A user with this email already exists." }, 409)
    }

    // Raw inserts bypass Better Auth's `user.create.before` hook. That's
    // exactly what we want — the hook only exists to protect against public
    // sign-up; invitations are the sanctioned way around it.
    const userId = crypto.randomUUID()
    const [firstName, ...rest] = parsed.data.name.trim().split(/\s+/)
    const lastName = rest.join(" ") || null
    const hashed = await hashPassword(parsed.data.password)

    await db.insert(authUser).values({
      id: userId,
      name: parsed.data.name.trim(),
      email: invite.email,
      emailVerified: true, // invitation implies verified email
      image: null,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(authAccount).values({
      id: `acc_${userId}`,
      userId,
      accountId: invite.email,
      providerId: "credential",
      password: hashed,
      createdAt: now,
      updatedAt: now,
    })
    await db
      .insert(userProfilesTable)
      .values({
        id: userId,
        firstName: firstName ?? null,
        lastName,
        avatarUrl: null,
      })
      .onConflictDoNothing()

    await db
      .update(userInvitationsTable)
      .set({ redeemedAt: now, redeemedByUserId: userId })
      .where(eq(userInvitationsTable.id, invite.id))

    return c.json({
      data: {
        id: userId,
        email: invite.email,
        name: parsed.data.name.trim(),
      },
    })
  })

  return routes
}
