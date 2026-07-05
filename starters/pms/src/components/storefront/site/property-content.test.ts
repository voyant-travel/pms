import { describe, expect, it } from "vitest"

import {
  ACME_DIRECTORY,
  ACME_PROPERTY_CONTENT,
  picsum,
  resolveAcmeContent,
  seedTokenFromUrl,
} from "./property-content"

describe("picsum", () => {
  it("builds a stable, encoded seed URL", () => {
    expect(picsum("acme-grand", 800, 500)).toBe("https://picsum.photos/seed/acme-grand/800/500")
  })
})

describe("seedTokenFromUrl", () => {
  it("extracts the base seed token from a room thumbnail", () => {
    expect(seedTokenFromUrl("https://picsum.photos/seed/acme-grand/800/500")).toBe("acme-grand")
    expect(seedTokenFromUrl("https://picsum.photos/seed/acme-seaside/800/500")).toBe("acme-seaside")
  })

  it("strips a numeric gallery suffix back to the property token", () => {
    expect(seedTokenFromUrl("https://picsum.photos/seed/acme-grand-2/800/500")).toBe("acme-grand")
  })

  it("returns null for unknown or missing seeds", () => {
    expect(seedTokenFromUrl("https://picsum.photos/seed/other/800/500")).toBeNull()
    expect(seedTokenFromUrl(null)).toBeNull()
    expect(seedTokenFromUrl(undefined)).toBeNull()
  })
})

describe("resolveAcmeContent", () => {
  it("resolves by thumbnail seed", () => {
    expect(
      resolveAcmeContent({ thumbnailUrl: "https://picsum.photos/seed/acme-seaside/800/500" }).key,
    ).toBe("acme-seaside")
  })

  it("falls back to a name-substring match when no seed is present", () => {
    expect(resolveAcmeContent({ name: "Acme City Apartments" }).key).toBe("acme-city")
    expect(resolveAcmeContent({ name: "Acme Seaside Resort" }).key).toBe("acme-seaside")
  })

  it("prefers the thumbnail seed over the name", () => {
    expect(
      resolveAcmeContent({
        thumbnailUrl: "https://picsum.photos/seed/acme-city/800/500",
        name: "Acme Grand Hotel",
      }).key,
    ).toBe("acme-city")
  })

  it("falls back to the flagship when nothing matches", () => {
    expect(resolveAcmeContent({ name: "Unknown Property" }).key).toBe("acme-grand")
  })
})

describe("ACME content integrity", () => {
  it("every content entry has copy, contact and imagery", () => {
    for (const entry of Object.values(ACME_PROPERTY_CONTENT)) {
      expect(entry.tagline.length).toBeGreaterThan(0)
      expect(entry.blurb.length).toBeGreaterThan(0)
      expect(entry.intro.length).toBeGreaterThan(0)
      expect(entry.highlights.length).toBeGreaterThan(0)
      expect(entry.gallerySeeds.length).toBeGreaterThan(0)
      expect(entry.phone).toMatch(/^\+/)
      expect(entry.email).toContain("@")
    }
  })

  it("directory entries point at real content keys, flagship first", () => {
    expect(ACME_DIRECTORY[0]?.key).toBe("acme-grand")
    for (const d of ACME_DIRECTORY) {
      expect(ACME_PROPERTY_CONTENT[d.key]).toBeDefined()
      expect(d.stars).toBeGreaterThanOrEqual(3)
    }
  })
})
