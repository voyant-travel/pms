import { defineModule, defineProject } from "@voyant-travel/framework/project"
import {
  selectStandardOperatorDistribution,
  STANDARD_OPERATOR_ACCESS,
  STANDARD_OPERATOR_DEPLOYMENT,
  STANDARD_OPERATOR_PRODUCT_BOM_REFERENCE,
} from "@voyant-travel/framework"

const distribution = selectStandardOperatorDistribution({
  // This deployment is the stays-focused PMS. These verticals are not part of
  // its application graph, so their package jobs must not be selected either.
  exclude: [
    "@voyant-travel/flights",
    "@voyant-travel/cruises",
    "@voyant-travel/cruises/content-extension",
    "@voyant-travel/charters",
    "@voyant-travel/mice",
    "@voyant-travel/realtime",
  ],
})

const strippedCatalogVerticalShims = defineModule({
  id: "@voyant-travel/pms-admin#catalog-stripped-vertical-shims",
  localId: "catalog-stripped-vertical-shims",
  provides: {
    ports: [{ id: "catalog.extension.charters" }, { id: "catalog.extension.cruises" }],
  },
})

export default defineProject({
  productBom: STANDARD_OPERATOR_PRODUCT_BOM_REFERENCE,
  modules: [...distribution.modules, strippedCatalogVerticalShims],
  extensions: distribution.extensions,
  access: {
    presets: STANDARD_OPERATOR_ACCESS.presets?.filter((preset) => preset.id !== "automation"),
  },
  // Product-job cadence is hosted explicitly by the Worker entry: managed
  // deployments use Cloud's HTTP scheduler, while self-hosted Wrangler uses
  // generated Cron Triggers. Keep the resolved graph target-neutral so the
  // same generated runtime can serve both authorities.
  deployment: {
    ...STANDARD_OPERATOR_DEPLOYMENT,
    target: undefined,
    mode: undefined,
    providers: {
      ...STANDARD_OPERATOR_DEPLOYMENT.providers,
      storage: "custom",
      scheduledJobs: "none",
    },
  },
})
