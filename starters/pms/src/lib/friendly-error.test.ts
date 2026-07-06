import { describe, expect, it } from "vitest"
import { mapValidationMessage, toFriendlyError } from "./friendly-error"

describe("mapValidationMessage", () => {
  it("maps zod lower-bound with the bound preserved", () => {
    expect(mapValidationMessage("Too small: expected number to be >=0")).toBe(
      "That value is too low — it must be at least 0.",
    )
    expect(mapValidationMessage("Too small: expected number to be >=1")).toBe(
      "That value is too low — it must be at least 1.",
    )
  })

  it("maps zod upper-bound with the bound preserved", () => {
    expect(mapValidationMessage("Too big: expected number to be <=100")).toBe(
      "That value is too high — it must be at most 100.",
    )
  })

  it("maps NaN / non-number input to a plain number prompt", () => {
    expect(mapValidationMessage("Invalid input: expected number, received nan")).toBe(
      "Please enter a valid number.",
    )
    expect(mapValidationMessage("expected number, received undefined")).toBe(
      "Please enter a valid number.",
    )
  })

  it("maps required + invalid-input shapes", () => {
    expect(mapValidationMessage("Required")).toBe("Please fill in the required fields.")
    expect(mapValidationMessage("Invalid input")).toBe(
      "Please check the highlighted fields and try again.",
    )
  })

  it("returns null for domain messages so they pass through untouched", () => {
    expect(mapValidationMessage("Folio not found")).toBeNull()
    expect(mapValidationMessage("Rate plan is not sellable")).toBeNull()
  })
})

describe("toFriendlyError", () => {
  it("friendly-maps a recognised validation Error", () => {
    expect(toFriendlyError(new Error("Too small: expected number to be >=0"), "Save failed")).toBe(
      "That value is too low — it must be at least 0.",
    )
  })

  it("passes a domain Error message through", () => {
    expect(toFriendlyError(new Error("Folio not found"), "Save failed")).toBe("Folio not found")
  })

  it("falls back for non-Error throws and empty messages", () => {
    expect(toFriendlyError("boom", "Save failed")).toBe("Save failed")
    expect(toFriendlyError(new Error(""), "Save failed")).toBe("Save failed")
  })
})
