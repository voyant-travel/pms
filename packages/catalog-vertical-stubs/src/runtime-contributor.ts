type FieldPolicy = unknown
type FieldPolicyRegistry = {
  policies: readonly FieldPolicy[]
  byPath: ReadonlyMap<string, FieldPolicy>
  resolve(lookupPath: string): FieldPolicy | undefined
}
type IndexerSlice = unknown
type CatalogProjectionExtension = {
  name: string
  project(): Promise<Map<string, unknown>>
}
type CatalogChartersRuntimeExtension = {
  fieldPolicy: readonly FieldPolicy[]
}
type CatalogCruisesRuntimeExtension = {
  fieldPolicy: readonly FieldPolicy[]
  createRegistry(fieldPolicy: readonly FieldPolicy[]): FieldPolicyRegistry
  createDocumentBuilder(): (entityId: string, slice: IndexerSlice) => Promise<unknown | null>
  createCabinFacetProjectionExtension(): CatalogProjectionExtension
  registerOwnedBookingHandler(): void
  registerAdapters(): void
  syncRegistry(): void
}

const catalogChartersRuntimeExtensionPort = { id: "catalog.extension.charters" } as const
const catalogCruisesRuntimeExtensionPort = { id: "catalog.extension.cruises" } as const
const emptyProjectionExtension: CatalogProjectionExtension = {
  name: "pms-disabled-vertical",
  async project() {
    return new Map<string, unknown>()
  },
}

const charters: CatalogChartersRuntimeExtension = {
  fieldPolicy: [],
}

const cruises: CatalogCruisesRuntimeExtension = {
  fieldPolicy: [],
  createRegistry: (fieldPolicy) => ({
    policies: fieldPolicy,
    byPath: new Map(),
    resolve: () => undefined,
  }),
  createDocumentBuilder: () => async (_entityId: string, _slice: IndexerSlice) => null,
  createCabinFacetProjectionExtension: () => emptyProjectionExtension,
  registerOwnedBookingHandler() {},
  registerAdapters() {},
  syncRegistry() {},
}

const financeCruisesPaymentPolicyRuntimePort = {
  id: "finance.cruises-payment-policy.runtime",
} as const

const cruisePaymentPolicy = {
  async resolveBookingPolicy() {
    return null
  },
  async resolveEntityPolicy() {
    return null
  },
  async resolveSupplierId() {
    return null
  },
}

export function createPmsCatalogVerticalStubRuntimePortContribution(): Readonly<
  Record<string, unknown>
> {
  return {
    [catalogChartersRuntimeExtensionPort.id]: charters,
    [catalogCruisesRuntimeExtensionPort.id]: cruises,
    [financeCruisesPaymentPolicyRuntimePort.id]: cruisePaymentPolicy,
  }
}
