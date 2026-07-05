// agent-quality: file-size exception -- SmartBill integration keeps event subscribers, settlement polling, and document sync mapping together until provider routes are split.
import { bookings } from "@voyant-travel/bookings/schema"
import {
  financeService,
  type InvoiceSettlementPoller,
  invoiceLineItems,
  invoices,
  taxRegimes,
} from "@voyant-travel/finance"
import type { HonoBundle } from "@voyant-travel/hono/plugin"
import { identityAddresses, identityContactPoints } from "@voyant-travel/identity/schema"
import { resolveBookingTaxSettings } from "@voyant-travel/operator-settings"
import {
  createSmartbillClient,
  createSmartbillInvoiceSettlementPoller,
  type SmartbillClient,
  type SmartbillInvoiceBody,
  type SmartbillProduct,
} from "@voyant-travel/plugin-smartbill"
import { organizations, people } from "@voyant-travel/relationships/schema"
import { and, asc, eq, inArray } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { withDbFromEnv } from "../lib/db"
import { createDocumentStorage } from "../lib/storage"

type SmartbillEnv = CloudflareBindings & {
  SMARTBILL_USERNAME?: string
  SMARTBILL_API_TOKEN?: string
  SMARTBILL_TOKEN?: string
  SMARTBILL_COMPANY_VAT_CODE?: string
  SMARTBILL_SERIES_NAME?: string
  SMARTBILL_INVOICE_SERIES_NAME?: string
  SMARTBILL_PROFORMA_SERIES_NAME?: string
  SMARTBILL_API_URL?: string
  SMARTBILL_LANGUAGE?: string
  SMARTBILL_ART_311_SPECIAL_REGIME?: string
}

type InvoiceIssuedPayload = {
  invoiceId?: string
  invoiceNumber?: string
  invoiceType?: "invoice" | "proforma" | "credit_note"
  externalAllocationRequired?: boolean
}

type SmartbillRuntime = {
  client: ReturnType<typeof createSmartbillClient>
  companyVatCode: string
  invoiceSeriesName: string
  proformaSeriesName: string
  apiUrl?: string
  language?: string
  art311SpecialRegime: boolean
}

type SmartbillTaxRegime = {
  name: string
  ratePercent: number | null
}

export const smartbillOperatorBundle: HonoBundle = {
  name: "operator-smartbill",
  bootstrap: async ({ bindings, eventBus }) => {
    const env = bindings as SmartbillEnv
    const runtime = resolveSmartbillRuntime(env)
    if (!runtime) {
      console.warn(
        "[smartbill] Runtime bootstrap skipped: set SMARTBILL_USERNAME, SMARTBILL_TOKEN or SMARTBILL_API_TOKEN, SMARTBILL_COMPANY_VAT_CODE, and SMARTBILL_SERIES_NAME to enable SmartBill sync.",
      )
      return
    }

    await ensureSmartbillInvoiceNumberSeries(env, runtime)

    eventBus.subscribe<InvoiceIssuedPayload>("invoice.issued", async ({ data }) => {
      await syncIssuedInvoice(env, runtime, data, "invoice")
    })

    eventBus.subscribe<InvoiceIssuedPayload>("invoice.proforma.issued", async ({ data }) => {
      await syncIssuedInvoice(env, runtime, data, "proforma")
    })
  },
}

export function createSmartbillSettlementPollers(
  bindings: CloudflareBindings,
): Record<string, InvoiceSettlementPoller> {
  const env = bindings as SmartbillEnv
  const runtimeOptions = resolveSmartbillRuntimeOptions(env)
  if (!runtimeOptions) return {}

  return {
    smartbill: createSmartbillInvoiceSettlementPoller({
      username: runtimeOptions.username,
      apiToken: runtimeOptions.apiToken,
      apiUrl: runtimeOptions.apiUrl,
      companyVatCode: runtimeOptions.companyVatCode,
      seriesName: runtimeOptions.invoiceSeriesName,
    }),
  }
}

async function ensureSmartbillInvoiceNumberSeries(env: SmartbillEnv, runtime: SmartbillRuntime) {
  try {
    await withDbFromEnv(env, async (rawDb) => {
      const db = rawDb as unknown as PostgresJsDatabase
      await financeService.ensureExternalInvoiceNumberSeries(db, [
        {
          provider: "smartbill",
          scope: "invoice",
          code: "smartbill-invoice",
          name: "SmartBill invoices",
          externalConfigKey: runtime.invoiceSeriesName,
          isDefault: true,
        },
        {
          provider: "smartbill",
          scope: "proforma",
          code: "smartbill-proforma",
          name: "SmartBill proformas",
          externalConfigKey: runtime.proformaSeriesName,
          isDefault: true,
        },
      ])
    })
  } catch (error) {
    console.warn("[smartbill] invoice number series bootstrap failed", error)
  }
}

function resolveSmartbillRuntime(env: SmartbillEnv): SmartbillRuntime | null {
  const options = resolveSmartbillRuntimeOptions(env)
  if (!options) return null
  return {
    ...options,
    client: createSmartbillClient({
      username: options.username,
      apiToken: options.apiToken,
      apiUrl: options.apiUrl,
    }),
  }
}

function resolveSmartbillRuntimeOptions(env: SmartbillEnv) {
  const username = nonEmpty(env.SMARTBILL_USERNAME)
  const apiToken = nonEmpty(env.SMARTBILL_API_TOKEN) ?? nonEmpty(env.SMARTBILL_TOKEN)
  const companyVatCode = nonEmpty(env.SMARTBILL_COMPANY_VAT_CODE)
  const invoiceSeriesName =
    nonEmpty(env.SMARTBILL_INVOICE_SERIES_NAME) ?? nonEmpty(env.SMARTBILL_SERIES_NAME)
  const proformaSeriesName =
    nonEmpty(env.SMARTBILL_PROFORMA_SERIES_NAME) ?? invoiceSeriesName ?? undefined

  if (!username || !apiToken || !companyVatCode || !invoiceSeriesName || !proformaSeriesName) {
    return null
  }

  return {
    username,
    apiToken,
    companyVatCode,
    invoiceSeriesName,
    proformaSeriesName,
    apiUrl: nonEmpty(env.SMARTBILL_API_URL),
    language: nonEmpty(env.SMARTBILL_LANGUAGE),
    art311SpecialRegime: parseBoolean(env.SMARTBILL_ART_311_SPECIAL_REGIME),
  }
}

async function syncIssuedInvoice(
  env: SmartbillEnv,
  runtime: SmartbillRuntime,
  payload: InvoiceIssuedPayload,
  documentType: "invoice" | "proforma",
) {
  const invoiceId = payload.invoiceId
  if (!invoiceId) return
  await withDbFromEnv(env, async (rawDb) => {
    const db = rawDb as unknown as PostgresJsDatabase
    await syncIssuedInvoiceWithDb(env, db, runtime, invoiceId, documentType)
  })
}

async function syncIssuedInvoiceWithDb(
  env: SmartbillEnv,
  db: PostgresJsDatabase,
  runtime: SmartbillRuntime,
  invoiceId: string,
  documentType: "invoice" | "proforma",
) {
  try {
    const externalRefs = await financeService.listInvoiceExternalRefs(db, invoiceId)
    const existingSmartbillRef = externalRefs.find((ref) => ref.provider === "smartbill")
    if (
      existingSmartbillRef &&
      !existingSmartbillRef.syncError &&
      (existingSmartbillRef.externalNumber || existingSmartbillRef.externalId)
    ) {
      return
    }

    const body = await buildSmartbillInvoiceBody(db, runtime, invoiceId, documentType)
    if (!body) return

    const result =
      documentType === "proforma"
        ? await runtime.client.createProforma(body)
        : await runtime.client.createInvoice(body)

    await financeService.registerInvoiceExternalRef(db, invoiceId, {
      provider: "smartbill",
      externalId: result.number ?? null,
      externalNumber: result.number ?? null,
      externalUrl: result.url ?? null,
      status: result.errorText ? "error" : "issued",
      syncedAt: new Date().toISOString(),
      syncError: result.errorText ?? null,
      metadata: {
        companyVatCode: runtime.companyVatCode,
        seriesName: body.seriesName,
        series: result.series ?? body.seriesName,
        number: result.number ?? null,
        documentType,
      },
    })

    if (result.number && !result.errorText) {
      await financeService.applyExternalInvoiceAllocation(db, invoiceId, {
        invoiceNumber: formatExternalInvoiceNumber(result.series ?? body.seriesName, result.number),
      })
    }

    console.info(
      `[smartbill] ${documentType} created: ${result.series ?? body.seriesName}-${result.number ?? "unknown"} for ${invoiceId}`,
    )

    // Fetch the PDF and store it as an invoice attachment so operators
    // can download the final document directly from the invoice detail
    // page. Failures are non-fatal — the SmartBill record exists either
    // way, and operators can fall back to externalRef.externalUrl.
    if (result.number && !result.errorText) {
      try {
        await fetchAndStoreSmartbillPdf(env, db, runtime, {
          invoiceId,
          documentType,
          seriesName: result.series ?? body.seriesName,
          number: result.number,
        })
      } catch (pdfError) {
        console.warn(
          `[smartbill] PDF fetch/store failed for ${invoiceId}; continuing without attachment`,
          pdfError,
        )
      }
    }
  } catch (error) {
    console.error(`[smartbill] failed to create ${documentType} for ${invoiceId}`, error)
    await financeService.registerInvoiceExternalRef(db, invoiceId, {
      provider: "smartbill",
      status: "error",
      syncedAt: new Date().toISOString(),
      syncError: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Fetch the rendered PDF from SmartBill for the freshly-created invoice
 * (or proforma) and persist it as an `invoice_attachments` row so it
 * shows up on the invoice detail page's Attachments section. Idempotent
 * via the storage key: re-running uploads the same key, and the
 * attachment row is only created when missing.
 */
async function fetchAndStoreSmartbillPdf(
  env: SmartbillEnv,
  db: PostgresJsDatabase,
  runtime: SmartbillRuntime,
  args: {
    invoiceId: string
    documentType: "invoice" | "proforma"
    seriesName: string
    number: string
  },
): Promise<void> {
  const storage = createDocumentStorage(env)
  if (!storage) return

  const existing = await financeService.listInvoiceAttachments(db, args.invoiceId)
  if (existing.some((a) => a.kind === "document")) return

  const pdf =
    args.documentType === "proforma"
      ? await runtime.client.viewEstimatePdf(runtime.companyVatCode, args.seriesName, args.number)
      : await runtime.client.viewInvoicePdf(runtime.companyVatCode, args.seriesName, args.number)

  const filename = `${args.seriesName}-${args.number}.pdf`
  const storageKey = `invoices/${args.invoiceId}/${filename}`
  const uploaded = await storage.upload(pdf.bytes, {
    key: storageKey,
    contentType: pdf.contentType || "application/pdf",
    metadata: {
      invoiceId: args.invoiceId,
      provider: "smartbill",
      documentType: args.documentType,
      series: args.seriesName,
      number: args.number,
    },
  })

  await financeService.createInvoiceAttachment(db, args.invoiceId, {
    kind: "document",
    name: filename,
    mimeType: pdf.contentType || "application/pdf",
    fileSize: pdf.bytes.byteLength,
    storageKey: uploaded.key,
    metadata: {
      provider: "smartbill",
      documentType: args.documentType,
      series: args.seriesName,
      number: args.number,
    },
  })
}

async function buildSmartbillInvoiceBody(
  db: PostgresJsDatabase,
  runtime: SmartbillRuntime,
  invoiceId: string,
  documentType: "invoice" | "proforma",
): Promise<SmartbillInvoiceBody | null> {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1)
  if (!invoice) return null

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, invoice.bookingId))
    .limit(1)
  if (!booking) return null

  const lineRows = await db
    .select()
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoice.id))
    .orderBy(asc(invoiceLineItems.sortOrder), asc(invoiceLineItems.createdAt))
  const taxRegime = invoice.taxRegimeId
    ? await resolveInvoiceTaxRegime(db, invoice.taxRegimeId)
    : null
  const bookingTaxSettings = await resolveBookingTaxSettings(db)
  const isTaxIncluded = bookingTaxSettings.taxPriceMode !== "exclusive"

  const client = await resolveSmartbillClient(db, booking)
  const body: SmartbillInvoiceBody = {
    companyVatCode: runtime.companyVatCode,
    client,
    seriesName:
      documentType === "proforma" ? runtime.proformaSeriesName : runtime.invoiceSeriesName,
    currency: invoice.currency,
    language: runtime.language ?? booking.communicationLanguage ?? "RO",
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    observations: invoice.notes ?? undefined,
    products: lineRows.map((line): SmartbillProduct => {
      const quantity = Math.max(line.quantity, 1)
      return {
        name: line.description,
        measuringUnitName: "buc",
        quantity,
        price: centsToMajor(line.unitPriceCents),
        currency: invoice.currency,
        isTaxIncluded,
        taxName: resolveSmartbillTaxName(taxRegime, line.taxRate),
        taxPercentage: line.taxRate ?? undefined,
        isService: true,
        saveToDb: false,
      }
    }),
  }

  if (invoice.status === "pending_external_allocation") {
    body.number = ""
  }

  if (runtime.art311SpecialRegime) {
    body.mentions = "Regimul special de taxare - agentie de turism (Art. 311 Cod Fiscal)"
  }

  return body
}

async function resolveInvoiceTaxRegime(db: PostgresJsDatabase, taxRegimeId: string) {
  const [row] = await db
    .select({
      name: taxRegimes.name,
      ratePercent: taxRegimes.ratePercent,
    })
    .from(taxRegimes)
    .where(eq(taxRegimes.id, taxRegimeId))
    .limit(1)

  return row ?? null
}

function resolveSmartbillTaxName(taxRegime: SmartbillTaxRegime | null, lineTaxRate: number | null) {
  if (!taxRegime?.name.trim()) return undefined
  if (
    lineTaxRate != null &&
    taxRegime.ratePercent != null &&
    taxRegime.ratePercent !== lineTaxRate
  ) {
    return undefined
  }
  return taxRegime.name.trim()
}

async function resolveSmartbillClient(
  db: PostgresJsDatabase,
  booking: typeof bookings.$inferSelect,
) {
  const entityIds = [booking.personId, booking.organizationId].filter((id): id is string =>
    Boolean(id),
  )
  const [person, organization, contactPoints, addresses] = await Promise.all([
    booking.personId
      ? db.select().from(people).where(eq(people.id, booking.personId)).limit(1)
      : Promise.resolve([]),
    booking.organizationId
      ? db.select().from(organizations).where(eq(organizations.id, booking.organizationId)).limit(1)
      : Promise.resolve([]),
    entityIds.length > 0
      ? db
          .select()
          .from(identityContactPoints)
          .where(
            and(
              inArray(identityContactPoints.entityId, entityIds),
              inArray(identityContactPoints.entityType, ["person", "organization"]),
            ),
          )
      : Promise.resolve([]),
    entityIds.length > 0
      ? db
          .select()
          .from(identityAddresses)
          .where(
            and(
              inArray(identityAddresses.entityId, entityIds),
              inArray(identityAddresses.entityType, ["person", "organization"]),
            ),
          )
      : Promise.resolve([]),
  ])

  const personRow = person[0]
  const organizationRow = organization[0]
  const billingEntityType = organizationRow ? "organization" : "person"
  const billingEntityId = organizationRow?.id ?? personRow?.id ?? null
  const primaryAddress =
    addresses.find(
      (address) => address.entityId === billingEntityId && address.label === "billing",
    ) ??
    addresses.find((address) => address.entityId === billingEntityId && address.isPrimary) ??
    addresses.find((address) => address.entityId === billingEntityId)
  const email =
    nonEmpty(booking.contactEmail) ??
    contactPoints.find(
      (point) =>
        point.entityType === billingEntityType &&
        point.entityId === billingEntityId &&
        point.kind === "email" &&
        point.isPrimary,
    )?.value ??
    contactPoints.find(
      (point) =>
        point.entityType === billingEntityType &&
        point.entityId === billingEntityId &&
        point.kind === "email",
    )?.value
  const phone =
    nonEmpty(booking.contactPhone) ??
    contactPoints.find(
      (point) =>
        point.entityType === billingEntityType &&
        point.entityId === billingEntityId &&
        (point.kind === "phone" || point.kind === "mobile") &&
        point.isPrimary,
    )?.value ??
    contactPoints.find(
      (point) =>
        point.entityType === billingEntityType &&
        point.entityId === billingEntityId &&
        (point.kind === "phone" || point.kind === "mobile"),
    )?.value

  const fallbackName = [booking.contactFirstName, booking.contactLastName].filter(Boolean).join(" ")
  const personName = personRow ? `${personRow.firstName} ${personRow.lastName}` : fallbackName
  const clientName =
    organizationRow?.legalName ?? organizationRow?.name ?? nonEmpty(personName) ?? "Client"
  const addressLine = nonEmpty(
    [primaryAddress?.line1, primaryAddress?.line2].filter(Boolean).join(", "),
  )
  const bookingAddressLine = nonEmpty(
    [booking.contactAddressLine1, booking.contactAddressLine2].filter(Boolean).join(", "),
  )

  return {
    name: clientName,
    vatCode: nonEmpty(booking.contactTaxId) ?? organizationRow?.taxId ?? undefined,
    address: nonEmpty(primaryAddress?.fullText) ?? addressLine ?? bookingAddressLine ?? "-",
    city: nonEmpty(primaryAddress?.city) ?? nonEmpty(booking.contactCity) ?? "-",
    county: nonEmpty(primaryAddress?.region) ?? nonEmpty(booking.contactRegion),
    country: nonEmpty(primaryAddress?.country) ?? nonEmpty(booking.contactCountry) ?? "Romania",
    email: nonEmpty(email),
    phone: nonEmpty(phone),
    contact: organizationRow && personName ? personName : undefined,
    saveToDb: false,
  } satisfies SmartbillClient
}

function centsToMajor(cents: number) {
  return Math.round(cents) / 100
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

function formatExternalInvoiceNumber(seriesName: string | undefined, number: string) {
  const trimmedNumber = number.trim()
  const trimmedSeries = seriesName?.trim()
  if (!trimmedSeries || trimmedNumber.startsWith(`${trimmedSeries}-`)) return trimmedNumber
  return `${trimmedSeries}-${trimmedNumber}`
}

function parseBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === "yes"
}
