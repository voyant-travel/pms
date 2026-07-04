import { brochureBodyToHtml, type ProductBrochurePrinter } from "@voyant-travel/inventory/tasks"
import { getCloudClient, type VoyantApiEnv } from "./voyant-cloud"

/**
 * Default brochure printer for this template.
 *
 * Renders the product brochure HTML to PDF via Voyant Cloud's browser-rendering
 * API. To switch providers, replace the body of this function — `@voyant-travel/inventory/tasks`
 * exports alternatives like `createCloudflareBrowserProductBrochurePrinter`
 * (direct Cloudflare API) and `createBasicPdfProductBrochurePrinter` (pdf-lib).
 */
export function createProductBrochurePrinter(env: VoyantApiEnv): ProductBrochurePrinter {
  const client = getCloudClient(env)

  return async ({ template, context }) => {
    const body = await client.browser.pdf({
      html: brochureBodyToHtml(template.body, template.bodyFormat, template.title),
    })

    return {
      body,
      mimeType: "application/pdf",
      fileSize: body.byteLength,
      metadata: {
        renderer: "voyant-cloud-browser",
        productId: context.product.id,
        bodyFormat: template.bodyFormat,
      },
    }
  }
}
