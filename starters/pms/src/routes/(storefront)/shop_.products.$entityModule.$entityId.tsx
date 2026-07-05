"use client"

import { createFileRoute, useParams, useSearch } from "@tanstack/react-router"
import type React from "react"

import { staySearchSchema } from "@/components/storefront/stay-search"
import { AccommodationDetailPage } from "./shop-product-detail-accommodations"
import { ProductDetailPageProducts } from "./shop-product-detail-products"

export const Route = createFileRoute("/(storefront)/shop_/products/$entityModule/$entityId")({
  component: DetailPage,
  validateSearch: staySearchSchema,
})

function DetailPage(): React.ReactElement {
  const { entityModule, entityId } = useParams({
    from: "/(storefront)/shop_/products/$entityModule/$entityId",
  })
  const search = useSearch({ from: "/(storefront)/shop_/products/$entityModule/$entityId" })

  if (entityModule === "accommodations") {
    return <AccommodationDetailPage entityId={entityId} stay={search} />
  }
  return <ProductDetailPageProducts entityModule={entityModule} entityId={entityId} />
}
