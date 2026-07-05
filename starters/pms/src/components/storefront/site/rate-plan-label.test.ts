import { describe, expect, it } from "vitest"

import { describeRate } from "./rate-plan-label"

describe("describeRate", () => {
  it("parses cancellation-first names", () => {
    expect(describeRate("Flexible — Bed & Breakfast")).toEqual({
      board: "Bed & Breakfast",
      cancellation: "Free cancellation",
    })
    expect(describeRate("Non-refundable — Room Only")).toEqual({
      board: "Room Only",
      cancellation: "Non-refundable",
    })
  })

  it("parses board-first names (the seed's Half Board plan)", () => {
    // Regression: previously rendered board "Flexible" with no cancellation.
    expect(describeRate("Half Board — Flexible")).toEqual({
      board: "Half Board",
      cancellation: "Free cancellation",
    })
  })

  it("recognises the weekly non-refundable apartment rate", () => {
    // Non-refundable wins over the weekly-minimum label when both appear.
    expect(describeRate("Weekly Non-refundable — Room Only")).toEqual({
      board: "Room Only",
      cancellation: "Non-refundable",
    })
    expect(describeRate("Weekly — Room Only")).toEqual({
      board: "Room Only",
      cancellation: "7-night minimum",
    })
  })

  it("falls back to Room only when no board keyword is present", () => {
    expect(describeRate("Non-refundable")).toEqual({
      board: "Room only",
      cancellation: "Non-refundable",
    })
  })

  it("handles a bare board name with no policy", () => {
    expect(describeRate("Full Board")).toEqual({
      board: "Full Board",
      cancellation: null,
    })
  })
})
