"use client"

import { useNavigate } from "@tanstack/react-router"
import { useAdminBreadcrumbs } from "@voyant-travel/admin/components/admin-breadcrumbs"
import { useLocale } from "@voyant-travel/admin/providers/locale"
import {
  type ProductDetailBreadcrumb,
  ProductDetailHostProvider,
  type ProductDetailHostValue,
  ProductDetailPage as ProductDetailPageBody,
} from "@voyant-travel/inventory-react/components/product-detail"
import { OptionResourceTemplatesPanel } from "@voyant-travel/operations-react/availability/admin/option-resource-templates-panel"
import { useMemo, useState } from "react"
import { useAdminMessages } from "@/lib/admin-i18n"
import { api } from "@/lib/api-client"

// App-specific storage upload (cookie-auth, browser-side file upload). The page
// turns this result into a media record via the injected `api`.
const uploadMedia: NonNullable<ProductDetailHostValue["uploadMedia"]> = async (file) => {
  const formData = new FormData()
  formData.append("file", file)
  const res = await fetch("/api/v1/admin/uploads", {
    method: "POST",
    body: formData,
    credentials: "include",
  })
  if (!res.ok) throw new Error(`Upload failed (${res.status})`)
  const upload = (await res.json()) as { key: string; url: string; mimeType: string; size: number }
  const mediaType: "image" | "video" | "document" = upload.mimeType.startsWith("video/")
    ? "video"
    : upload.mimeType.startsWith("image/")
      ? "image"
      : "document"
  return {
    url: upload.url,
    name: file.name,
    storageKey: upload.key,
    mimeType: upload.mimeType,
    fileSize: upload.size,
    mediaType,
  }
}

const renderOptionExtras = (productId: string, optionId: string) => (
  <OptionResourceTemplatesPanel productId={productId} optionId={optionId} />
)

/**
 * Operator substitution for the packaged products-detail page (the
 * `detailPageComponent` seam on `createInventoryAdminExtension`). The
 * package cannot compose these app-owned seams itself: the
 * availability-react option resource templates panel (a dependency cycle —
 * availability-react depends on products-react), the app's `/api/v1/admin/uploads`
 * storage route, and the product-pre-selected new-booking deep link.
 */
export function ProductDetailPage({ id }: { id: string }) {
  const messages = useAdminMessages()
  const { resolvedLocale } = useLocale()
  const navigate = useNavigate()
  const [breadcrumbs, setBreadcrumbs] = useState<ProductDetailBreadcrumb[]>([])
  useAdminBreadcrumbs(breadcrumbs)

  const navigation = useMemo<ProductDetailHostValue["navigate"]>(
    () => ({
      toProducts: () => void navigate({ to: "/products" }),
      toProduct: (productId) => void navigate({ to: "/products/$id", params: { id: productId } }),
      toNewBooking: (productId) =>
        void navigate({ to: "/bookings/$id", params: { id: "new" }, search: { productId } }),
      toAvailability: (slotId) =>
        void navigate({ to: "/operations/availability/$id", params: { id: slotId } }),
    }),
    [navigate],
  )

  const host = useMemo<ProductDetailHostValue>(
    () => ({
      messages,
      api,
      locale: resolvedLocale,
      navigate: navigation,
      uploadMedia,
      setBreadcrumbs,
      renderOptionExtras,
    }),
    [messages, resolvedLocale, navigation],
  )

  return (
    <ProductDetailHostProvider value={host}>
      <ProductDetailPageBody id={id} />
    </ProductDetailHostProvider>
  )
}
