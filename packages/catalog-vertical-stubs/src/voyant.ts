const catalogChartersRuntimeExtensionPort = { id: "catalog.extension.charters" } as const
const catalogCruisesRuntimeExtensionPort = { id: "catalog.extension.cruises" } as const

export const pmsCatalogVerticalStubsVoyantModule = {
  schemaVersion: "voyant.module.v1",
  id: "@voyant-travel/pms-catalog-vertical-stubs",
  packageName: "@voyant-travel/pms-catalog-vertical-stubs",
  localId: "pms.catalog-vertical-stubs",
  provides: {
    ports: [
      { id: catalogChartersRuntimeExtensionPort.id },
      { id: catalogCruisesRuntimeExtensionPort.id },
    ],
  },
  meta: {
    ownership: "deployment",
    description:
      "No-op Catalog runtime extensions for standard verticals excluded from the stays-only PMS graph.",
  },
}

export default pmsCatalogVerticalStubsVoyantModule
