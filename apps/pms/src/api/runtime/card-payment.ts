import { type CardPaymentStarter, financeService } from "@voyant-travel/finance"
import { netopiaCardPaymentStarter } from "@voyant-travel/plugin-netopia"

/**
 * The card-payment processor for this deployment. Every checkout surface
 * (flights, trips checkout, payment links, catalog) routes card payments
 * through this single starter. To use a different processor, replace the
 * right-hand side with that provider's CardPaymentStarter — nothing else changes.
 */
const netopiaStarter = netopiaCardPaymentStarter()

const mockCardPaymentStarter: CardPaymentStarter = async (c, args) => {
  const env = c.env as {
    APP_URL?: string
    DASH_BASE_URL?: string
    PUBLIC_CHECKOUT_BASE_URL?: string
  }
  const baseUrl =
    env.PUBLIC_CHECKOUT_BASE_URL?.trim() ||
    env.DASH_BASE_URL?.trim() ||
    env.APP_URL?.trim().replace(/\/api\/?$/, "") ||
    new URL(c.req.url).origin
  const redirectUrl = `${baseUrl.replace(/\/$/, "")}/api/v1/local/mock-card/${encodeURIComponent(
    args.sessionId,
  )}/approve`

  await financeService.markPaymentSessionRequiresRedirect(args.db, args.sessionId, {
    provider: "local-mock-card",
    providerSessionId: `mock_${args.sessionId}`,
    providerPaymentId: null,
    redirectUrl,
    returnUrl: args.returnUrl ?? null,
    providerPayload: {
      description: args.description ?? null,
      billing: args.billing,
    },
    metadata: { localMock: true },
  })

  return { redirectUrl }
}

export const cardPaymentStarter: CardPaymentStarter = (c, args) => {
  const enabled = String((c.env as { MOCK_CARD_PAYMENTS?: string }).MOCK_CARD_PAYMENTS ?? "")
    .trim()
    .toLowerCase()
  if (["1", "true", "yes", "on"].includes(enabled)) {
    return mockCardPaymentStarter(c, args)
  }
  return netopiaStarter(c, args)
}
