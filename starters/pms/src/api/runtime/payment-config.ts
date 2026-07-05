import type { CheckoutBankTransferDetails } from "@voyant-travel/finance/checkout"

interface OperatorProfileLike {
  name?: string | null
  legalName?: string | null
}

interface PaymentInstructionsLike {
  bankTransferBeneficiary?: string | null
  iban?: string | null
  bank?: string | null
  notes?: string | null
}

interface PaymentConfigBindings {
  APP_URL?: string
  BANK_TRANSFER_BANK_NAME?: string
  BANK_TRANSFER_BENEFICIARY?: string
  BANK_TRANSFER_IBAN?: string
  BANK_TRANSFER_NOTES?: string
  DASH_BASE_URL?: string
  PUBLIC_CHECKOUT_BASE_URL?: string
}

export function resolveBankTransferDetails(
  bindings: Record<string, unknown>,
): CheckoutBankTransferDetails | null {
  const env = bindings as PaymentConfigBindings
  if (!env.BANK_TRANSFER_BENEFICIARY || !env.BANK_TRANSFER_IBAN) return null
  return {
    provider: "bank-transfer",
    beneficiary: env.BANK_TRANSFER_BENEFICIARY,
    iban: env.BANK_TRANSFER_IBAN,
    bankName: env.BANK_TRANSFER_BANK_NAME ?? null,
    // Currency comes from the invoice (per-booking); env value would be
    // wrong for any deal not in the deploy's home currency. Notes here are
    // just deploy-wide boilerplate — per-call collection notes override.
    notes: env.BANK_TRANSFER_NOTES ?? null,
  }
}

export function resolvePublicCheckoutBaseUrlFromBindings(
  bindings: Record<string, unknown>,
): string | null {
  const env = bindings as PaymentConfigBindings
  return (
    env.PUBLIC_CHECKOUT_BASE_URL?.trim() ||
    env.DASH_BASE_URL?.trim() ||
    env.APP_URL?.trim().replace(/\/api\/?$/, "") ||
    null
  )
}

export function bankTransferDetailsFromOperatorSettings(
  operatorProfile: OperatorProfileLike | null | undefined,
  paymentInstructions: PaymentInstructionsLike | null | undefined,
  bindings: Record<string, unknown>,
): CheckoutBankTransferDetails | null {
  const envDetails = resolveBankTransferDetails(bindings)
  const beneficiary =
    paymentInstructions?.bankTransferBeneficiary ||
    operatorProfile?.legalName ||
    operatorProfile?.name ||
    envDetails?.beneficiary
  const iban = paymentInstructions?.iban || envDetails?.iban
  if (!beneficiary || !iban) return null
  return {
    provider: "bank-transfer",
    beneficiary,
    iban,
    bankName: paymentInstructions?.bank || envDetails?.bankName || null,
    notes: paymentInstructions?.notes || envDetails?.notes || null,
  }
}
