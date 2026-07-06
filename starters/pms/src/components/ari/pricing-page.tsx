"use client"

/**
 * The Pricing page: express nightly pricing as named rules instead of painting
 * calendar cells. Three stacked sections — starting prices, pricing rules, then
 * preview & apply — all scoped to the property selected in the shared shell.
 */

import { Separator } from "@voyant-travel/ui/components/separator"
import { ariMessages } from "./ari-messages"
import { AriPageShell } from "./ari-page-shell"
import { PricingBaseRates } from "./pricing-base-rates"
import { PricingPreviewBar } from "./pricing-preview-bar"
import { PricingRulesList } from "./pricing-rules-list"

function PricingSections({ propertyId }: { propertyId: string }) {
  const m = ariMessages.pricing
  return (
    <div className="flex flex-col gap-8">
      <p className="max-w-3xl text-muted-foreground text-sm">{m.intro}</p>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">{m.baseRates.title}</h2>
          <p className="text-muted-foreground text-sm">{m.baseRates.subtitle}</p>
        </div>
        <PricingBaseRates propertyId={propertyId} />
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <PricingRulesList propertyId={propertyId} />
      </section>

      <Separator />

      <section>
        <PricingPreviewBar propertyId={propertyId} />
      </section>
    </div>
  )
}

export function PricingPage() {
  return (
    <AriPageShell title={ariMessages.pricing.title}>
      {(propertyId) => <PricingSections propertyId={propertyId} />}
    </AriPageShell>
  )
}
