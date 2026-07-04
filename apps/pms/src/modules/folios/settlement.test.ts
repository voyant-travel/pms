import { describe, expect, it } from "vitest"

import { buildFolioInvoiceInput, invoiceNumberForFolio } from "./settlement"

describe("buildFolioInvoiceInput", () => {
  it("maps non-payment postings to lines with tax folded into taxCents", () => {
    const result = buildFolioInvoiceInput("EUR", [
      { type: "room", amountCents: 40000 },
      { type: "tax", amountCents: 3600 },
      { type: "extra", amountCents: 1500 },
      { type: "payment", amountCents: -45100 },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.invoice.currency).toBe("EUR")
    expect(result.invoice.taxCents).toBe(3600)
    expect(result.invoice.subtotalCents).toBe(41500) // room + extra
    expect(result.invoice.totalCents).toBe(45100) // subtotal + tax
    // one line per non-tax type, largest first
    expect(result.invoice.lineItems).toEqual([
      { description: "Accommodation", quantity: 1, unitPriceCents: 40000, totalCents: 40000 },
      { description: "Extras", quantity: 1, unitPriceCents: 1500, totalCents: 1500 },
    ])
  })

  it("nets same-type reversals to zero and drops the emptied type", () => {
    const result = buildFolioInvoiceInput("EUR", [
      { type: "room", amountCents: 20000 },
      { type: "room", amountCents: 20000 },
      { type: "room", amountCents: -20000 }, // void of one night
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.invoice.lineItems).toEqual([
      { description: "Accommodation", quantity: 1, unitPriceCents: 20000, totalCents: 20000 },
    ])
    expect(result.invoice.totalCents).toBe(20000)
  })

  it("lines always reconcile with the invoice subtotal", () => {
    const result = buildFolioInvoiceInput("EUR", [
      { type: "room", amountCents: 30000 },
      { type: "fee", amountCents: 2000 },
      { type: "extra", amountCents: 800 },
    ])
    if (!result.ok) throw new Error("expected ok")
    const lineSum = result.invoice.lineItems.reduce((s, l) => s + l.totalCents, 0)
    expect(lineSum).toBe(result.invoice.subtotalCents)
  })

  it("refuses a negative-net posting type (standalone credit)", () => {
    const result = buildFolioInvoiceInput("EUR", [
      { type: "room", amountCents: 20000 },
      { type: "adjustment", amountCents: -5000 },
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/credit/)
  })

  it("refuses a folio with no billable charges", () => {
    const result = buildFolioInvoiceInput("EUR", [{ type: "payment", amountCents: -1000 }])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/no billable charges/)
  })
})

describe("invoiceNumberForFolio", () => {
  it("prefixes the folio number", () => {
    expect(invoiceNumberForFolio("F-0007")).toBe("INV-F-0007")
  })
})
