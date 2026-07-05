import { productCapabilities, products } from "@voyant-travel/inventory/schema"
import { and, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export async function resolveBookingRequirementsProductSnapshot(
  db: PostgresJsDatabase,
  productId: string,
) {
  const [product, capabilityRows] = await Promise.all([
    db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({ capability: productCapabilities.capability })
      .from(productCapabilities)
      .where(
        and(eq(productCapabilities.productId, productId), eq(productCapabilities.enabled, true)),
      ),
  ])

  if (!product) return null

  return {
    id: product.id,
    bookingMode: product.bookingMode,
    capabilities: capabilityRows.map((row) => row.capability),
  }
}
