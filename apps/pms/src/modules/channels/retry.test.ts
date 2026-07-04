import { describe, expect, it } from "vitest"

import { MAX_ARI_PUSH_ATTEMPTS, nextEventState, stateForThrow } from "./retry"

describe("nextEventState", () => {
  it("a pushed result is terminal success and clears the error", () => {
    expect(nextEventState(0, { status: "pushed", ref: "x" })).toEqual({
      status: "pushed",
      attempts: 1,
      lastError: null,
    })
  })

  it("a skipped result is terminal and does NOT burn a retry", () => {
    expect(nextEventState(2, { status: "skipped", error: "no mapping" })).toEqual({
      status: "skipped",
      attempts: 2,
      lastError: "no mapping",
    })
  })

  it("a failed result increments attempts and stays pending below the cap", () => {
    expect(nextEventState(0, { status: "failed", error: "boom" })).toEqual({
      status: "pending",
      attempts: 1,
      lastError: "boom",
    })
  })

  it("parks the event as failed once attempts reach the cap", () => {
    const state = nextEventState(MAX_ARI_PUSH_ATTEMPTS - 1, { status: "failed", error: "boom" })
    expect(state.status).toBe("failed")
    expect(state.attempts).toBe(MAX_ARI_PUSH_ATTEMPTS)
  })

  it("defaults the error message when the connector gives none", () => {
    expect(nextEventState(0, { status: "failed" }).lastError).toBe("push failed")
  })
})

describe("stateForThrow", () => {
  it("treats a thrown Error as a failed attempt with its message", () => {
    expect(stateForThrow(0, new Error("kaboom"))).toEqual({
      status: "pending",
      attempts: 1,
      lastError: "kaboom",
    })
  })

  it("stringifies a non-Error throw", () => {
    expect(stateForThrow(0, "weird").lastError).toBe("weird")
  })
})
