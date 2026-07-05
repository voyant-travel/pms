import { queryOptions } from "@tanstack/react-query"
import { createMiddleware, createServerFn } from "@tanstack/react-start"
import {
  type BookingsAggregates,
  buildDashboardSixMonthWindow,
  dashboardQueryKeys,
  type FinanceAggregates,
  type ProductsAggregates,
  type SuppliersAggregates,
} from "@voyant-travel/admin/dashboard/query-options"

import { dbFromEnvForApp } from "../api/lib/db"
import { getOperatorStartEnv } from "./operator-start-context"

type OperatorServerContext = {
  env?: CloudflareBindings
  request: Request
}

const withOperatorRequest = createMiddleware({ type: "request" }).server(
  ({ context, next, request }) =>
    next({
      context: { request, env: getOperatorStartEnv(context) },
    }),
)

function requireOperatorEnv(context: OperatorServerContext): CloudflareBindings {
  if (!context.env) {
    throw new Error("Cloudflare bindings are not available for server-side dashboard data")
  }
  return context.env
}

function unauthorizedDashboardError(): Error & { status: 401 } {
  return Object.assign(new Error("Unauthorized"), { status: 401 as const })
}

async function requireAuthenticatedOperatorRequest(
  context: OperatorServerContext,
): Promise<CloudflareBindings> {
  const env = requireOperatorEnv(context)
  const { hasAuthPermission } = await import("../api/auth/handler")

  if (!(await hasAuthPermission(context.request, env))) {
    throw unauthorizedDashboardError()
  }

  return env
}

async function withDashboardDb<T>(
  env: CloudflareBindings,
  fn: (db: ReturnType<typeof dbFromEnvForApp>["db"]) => Promise<T>,
): Promise<T> {
  const { db, dispose } = dbFromEnvForApp(env)
  try {
    return await fn(db)
  } finally {
    await dispose()
  }
}

export const getOperatorDashboardBookingsAggregates = createServerFn({ method: "GET" })
  .middleware([withOperatorRequest])
  .handler(async ({ context }) => {
    const env = await requireAuthenticatedOperatorRequest(context)
    const { from } = buildDashboardSixMonthWindow()
    return withDashboardDb(env, async (db) => {
      const { bookingsService } = await import("@voyant-travel/bookings")
      const serviceDb = db as unknown as Parameters<typeof bookingsService.getBookingAggregates>[0]
      return bookingsService.getBookingAggregates(serviceDb, { from, upcomingLimit: 8 })
    })
  })

export const getOperatorDashboardProductsAggregates = createServerFn({ method: "GET" })
  .middleware([withOperatorRequest])
  .handler(async ({ context }) => {
    const env = await requireAuthenticatedOperatorRequest(context)
    return withDashboardDb(env, async (db) => {
      const { productsService } = await import("@voyant-travel/inventory")
      const serviceDb = db as unknown as Parameters<typeof productsService.getProductAggregates>[0]
      return productsService.getProductAggregates(serviceDb)
    })
  })

export const getOperatorDashboardSuppliersAggregates = createServerFn({ method: "GET" })
  .middleware([withOperatorRequest])
  .handler(async ({ context }) => {
    const env = await requireAuthenticatedOperatorRequest(context)
    return withDashboardDb(env, async (db) => {
      const { suppliersService } = await import("@voyant-travel/distribution")
      const serviceDb = db as unknown as Parameters<
        typeof suppliersService.getSupplierAggregates
      >[0]
      return suppliersService.getSupplierAggregates(serviceDb)
    })
  })

export const getOperatorDashboardFinanceAggregates = createServerFn({ method: "GET" })
  .middleware([withOperatorRequest])
  .handler(async ({ context }) => {
    const env = await requireAuthenticatedOperatorRequest(context)
    const { from } = buildDashboardSixMonthWindow()
    return withDashboardDb(env, async (db) => {
      const { financeService } = await import("@voyant-travel/finance")
      const serviceDb = db as unknown as Parameters<typeof financeService.getFinanceAggregates>[0]
      return financeService.getFinanceAggregates(serviceDb, { from, outstandingTopLimit: 5 })
    })
  })

export function getOperatorDashboardBookingsAggregatesQueryOptions() {
  const { from } = buildDashboardSixMonthWindow()
  return queryOptions({
    queryKey: dashboardQueryKeys.bookingsAggregates(from),
    queryFn: async (): Promise<{ data: BookingsAggregates }> => ({
      data: await getOperatorDashboardBookingsAggregates(),
    }),
    staleTime: 60_000,
  })
}

export function getOperatorDashboardProductsAggregatesQueryOptions() {
  return queryOptions({
    queryKey: dashboardQueryKeys.productsAggregates(),
    queryFn: async (): Promise<{ data: ProductsAggregates }> => ({
      data: await getOperatorDashboardProductsAggregates(),
    }),
    staleTime: 60_000,
  })
}

export function getOperatorDashboardSuppliersAggregatesQueryOptions() {
  return queryOptions({
    queryKey: dashboardQueryKeys.suppliersAggregates(),
    queryFn: async (): Promise<{ data: SuppliersAggregates }> => ({
      data: await getOperatorDashboardSuppliersAggregates(),
    }),
    staleTime: 60_000,
  })
}

export function getOperatorDashboardFinanceAggregatesQueryOptions() {
  const { from } = buildDashboardSixMonthWindow()
  return queryOptions({
    queryKey: dashboardQueryKeys.financeAggregates(from),
    queryFn: async (): Promise<{ data: FinanceAggregates }> => ({
      data: await getOperatorDashboardFinanceAggregates(),
    }),
    staleTime: 60_000,
  })
}
