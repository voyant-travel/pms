import { describe, expect, it } from "vitest"

import { parseReplicaUrls } from "./db"

const PRIMARY = "postgresql://user:pass@ep-primary.eu-central-1.aws.neon.tech/db"

describe("parseReplicaUrls", () => {
  it("returns [] for undefined", () => {
    expect(parseReplicaUrls(undefined, PRIMARY)).toEqual([])
  })

  it("returns [] for an empty string", () => {
    expect(parseReplicaUrls("", PRIMARY)).toEqual([])
  })

  it("returns [] for whitespace and bare commas", () => {
    expect(parseReplicaUrls("  ,  , ", PRIMARY)).toEqual([])
  })

  it("parses a single replica URL", () => {
    const replica = "postgresql://user:pass@ep-replica-1.eu-central-1.aws.neon.tech/db"
    expect(parseReplicaUrls(replica, PRIMARY)).toEqual([replica])
  })

  it("splits on commas and trims surrounding whitespace", () => {
    const r1 = "postgresql://user:pass@ep-replica-1.eu-central-1.aws.neon.tech/db"
    const r2 = "postgresql://user:pass@ep-replica-2.eu-central-1.aws.neon.tech/db"
    expect(parseReplicaUrls(` ${r1} , ${r2} `, PRIMARY)).toEqual([r1, r2])
  })

  it("drops empty entries between commas", () => {
    const r1 = "postgresql://user:pass@ep-replica-1.eu-central-1.aws.neon.tech/db"
    expect(parseReplicaUrls(`${r1},,`, PRIMARY)).toEqual([r1])
  })

  it("drops entries equal to the primary URL", () => {
    const r1 = "postgresql://user:pass@ep-replica-1.eu-central-1.aws.neon.tech/db"
    expect(parseReplicaUrls(`${PRIMARY},${r1}`, PRIMARY)).toEqual([r1])
    expect(parseReplicaUrls(PRIMARY, PRIMARY)).toEqual([])
  })

  it("drops entries that equal the primary after trimming", () => {
    expect(parseReplicaUrls(`  ${PRIMARY}  `, PRIMARY)).toEqual([])
  })

  it("preserves replica order", () => {
    const r1 = "postgresql://user:pass@ep-replica-1.eu-central-1.aws.neon.tech/db"
    const r2 = "postgresql://user:pass@ep-replica-2.eu-central-1.aws.neon.tech/db"
    const r3 = "postgresql://user:pass@ep-replica-3.eu-central-1.aws.neon.tech/db"
    expect(parseReplicaUrls(`${r2},${r3},${r1}`, PRIMARY)).toEqual([r2, r3, r1])
  })
})
