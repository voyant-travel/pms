"use client"

import { createFileRoute, useParams } from "@tanstack/react-router"
import type React from "react"

import { AccommodationDetailPage } from "./shop-product-detail-accommodations"
import { CruiseDetailPage } from "./shop-product-detail-cruises"
import { ProductDetailPageProducts } from "./shop-product-detail-products"

export const Route = createFileRoute("/(storefront)/shop_/products/$entityModule/$entityId")({
  component: DetailPage,
})

function DetailPage(): React.ReactElement {
  const { entityModule, entityId } = useParams({
    from: "/(storefront)/shop_/products/$entityModule/$entityId",
  })

  if (entityModule === "cruises") {
    return <CruiseDetailPage entityId={entityId} />
  }
  if (entityModule === "accommodations") {
    return <AccommodationDetailPage entityId={entityId} />
  }
  return <ProductDetailPageProducts entityModule={entityModule} entityId={entityId} />
}
