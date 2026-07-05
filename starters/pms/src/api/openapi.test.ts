import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { buildOperatorOpenApiDocuments } from "./openapi.js"

/**
 * OpenAPI drift gate (voyant#2114).
 *
 * The committed `openapi/*.json` artifacts are generated from the composed app,
 * so they cannot be hand-edited and cannot silently fall behind the handlers.
 * This spec regenerates them in-memory and asserts they match what's committed;
 * any added/changed/removed `.openapi()` route that wasn't regenerated fails CI.
 *
 * To update after an intentional route change:
 *   pnpm --filter operator generate:openapi
 * (runs this file with `UPDATE_OPENAPI=1`, rewriting the artifacts).
 */
const OUT_DIR = join(process.cwd(), "openapi")
const docs = await buildOperatorOpenApiDocuments()
const artifacts = {
  "framework-openapi.json": docs.full,
  "framework-admin.json": docs.admin,
  "framework-storefront.json": docs.storefront,
}
const serialize = (doc: unknown) => `${JSON.stringify(doc, null, 2)}\n`

if (process.env.UPDATE_OPENAPI) {
  mkdirSync(OUT_DIR, { recursive: true })
  for (const [name, doc] of Object.entries(artifacts)) {
    writeFileSync(join(OUT_DIR, name), serialize(doc))
  }
}

describe("operator openapi spec", () => {
  it("is generated as a 3.1.0 document", () => {
    expect(docs.full.openapi).toBe("3.1.0")
  })

  for (const [name, doc] of Object.entries(artifacts)) {
    it(`${name} matches the committed artifact (no drift)`, () => {
      let committed: string
      try {
        committed = readFileSync(join(OUT_DIR, name), "utf8")
      } catch {
        throw new Error(
          `${name} is missing — run \`pnpm --filter operator generate:openapi\` and commit it.`,
        )
      }
      expect(
        serialize(doc),
        `${name} is out of date — run \`pnpm --filter operator generate:openapi\` and commit the result.`,
      ).toBe(committed)
    })
  }

  it("documents routes under their composed surface prefix", () => {
    for (const p of Object.keys(docs.admin.paths ?? {})) {
      expect(p.startsWith("/v1/admin")).toBe(true)
    }
    for (const p of Object.keys(docs.storefront.paths ?? {})) {
      expect(p.startsWith("/v1/public")).toBe(true)
    }
  })
})
