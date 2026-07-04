"use client"

/**
 * Settings -> Operator profile.
 *
 * Operator identity, payment instructions, and operator-level
 * booking payment defaults live in separate API/storage concepts, but
 * remain one operational settings form.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { noDepositPolicy, type PaymentPolicy } from "@voyant-travel/finance/payment-policy"
import { PaymentPolicyForm, PaymentPolicyPreview } from "@voyant-travel/finance-react/ui"
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from "@voyant-travel/ui/components"
import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { useAdminMessages } from "@/lib/admin-i18n"
import { getApiUrl } from "@/lib/env"

interface OperatorProfileForm {
  name?: string | null
  legalName?: string | null
  vatId?: string | null
  registrationNumber?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  bankTransferBeneficiary?: string | null
  iban?: string | null
  bank?: string | null
  notes?: string | null
  license?: string | null
  licenseAuthority?: string | null
  signatoryName?: string | null
  signatoryRole?: string | null
  customerPaymentPolicy?: PaymentPolicy | null
  bookingCheckoutUrlTemplate?: string | null
  invoicePayUrlTemplate?: string | null
}

type OperatorProfileRecord = Omit<
  OperatorProfileForm,
  "bankTransferBeneficiary" | "iban" | "bank" | "notes" | "customerPaymentPolicy"
>
type OperatorPaymentInstructionsRecord = Pick<
  OperatorProfileForm,
  "bankTransferBeneficiary" | "iban" | "bank" | "notes"
>
type OperatorPaymentDefaultsRecord = Pick<OperatorProfileForm, "customerPaymentPolicy">
type OperatorCheckoutLinksRecord = Pick<
  OperatorProfileForm,
  "bookingCheckoutUrlTemplate" | "invoicePayUrlTemplate"
>

const EMPTY_FORM: OperatorProfileForm = {
  name: "",
  legalName: "",
  vatId: "",
  registrationNumber: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  bankTransferBeneficiary: "",
  iban: "",
  bank: "",
  notes: "",
  license: "",
  licenseAuthority: "",
  signatoryName: "",
  signatoryRole: "",
  customerPaymentPolicy: null,
  bookingCheckoutUrlTemplate: "",
  invoicePayUrlTemplate: "",
}

export function OperatorProfilePage() {
  const queryClient = useQueryClient()
  const t = useAdminMessages().settings.operatorProfilePage

  const { data, isPending } = useQuery({
    queryKey: ["operator-profile-settings"],
    queryFn: async (): Promise<OperatorProfileForm | null> => {
      const [profileRes, instructionsRes, defaultsRes] = await Promise.all([
        fetch(`${getApiUrl()}/v1/admin/settings/operator-profile`, { credentials: "include" }),
        fetch(`${getApiUrl()}/v1/admin/settings/operator-payment-instructions`, {
          credentials: "include",
        }),
        fetch(`${getApiUrl()}/v1/admin/settings/operator-payment-defaults`, {
          credentials: "include",
        }),
      ])
      if (!profileRes.ok && !instructionsRes.ok && !defaultsRes.ok) return null

      const [profileJson, instructionsJson, defaultsJson] = await Promise.all([
        profileRes.ok
          ? ((await profileRes.json()) as { data?: OperatorProfileRecord | null })
          : { data: null },
        instructionsRes.ok
          ? ((await instructionsRes.json()) as { data?: OperatorPaymentInstructionsRecord | null })
          : { data: null },
        defaultsRes.ok
          ? ((await defaultsRes.json()) as {
              data?: (OperatorPaymentDefaultsRecord & OperatorCheckoutLinksRecord) | null
            })
          : { data: null },
      ])

      return {
        ...EMPTY_FORM,
        ...(profileJson.data ?? {}),
        ...(instructionsJson.data ?? {}),
        customerPaymentPolicy: defaultsJson.data?.customerPaymentPolicy ?? null,
        bookingCheckoutUrlTemplate: defaultsJson.data?.bookingCheckoutUrlTemplate ?? "",
        invoicePayUrlTemplate: defaultsJson.data?.invoicePayUrlTemplate ?? "",
      }
    },
  })
  const [form, setForm] = useState<OperatorProfileForm>(EMPTY_FORM)

  useEffect(() => {
    if (data) {
      setForm({ ...EMPTY_FORM, ...data })
    }
  }, [data])

  const save = useMutation({
    mutationFn: async (next: OperatorProfileForm) => {
      const responses = await Promise.all([
        fetch(`${getApiUrl()}/v1/admin/settings/operator-profile`, {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: next.name ?? null,
            legalName: next.legalName ?? null,
            vatId: next.vatId ?? null,
            registrationNumber: next.registrationNumber ?? null,
            address: next.address ?? null,
            phone: next.phone ?? null,
            email: next.email ?? null,
            website: next.website ?? null,
            license: next.license ?? null,
            licenseAuthority: next.licenseAuthority ?? null,
            signatoryName: next.signatoryName ?? null,
            signatoryRole: next.signatoryRole ?? null,
          }),
        }),
        fetch(`${getApiUrl()}/v1/admin/settings/operator-payment-instructions`, {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            bankTransferBeneficiary: next.bankTransferBeneficiary ?? null,
            iban: next.iban ?? null,
            bank: next.bank ?? null,
            notes: next.notes ?? null,
          }),
        }),
        fetch(`${getApiUrl()}/v1/admin/settings/operator-payment-defaults`, {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            customerPaymentPolicy: next.customerPaymentPolicy ?? null,
            bookingCheckoutUrlTemplate: next.bookingCheckoutUrlTemplate || null,
            invoicePayUrlTemplate: next.invoicePayUrlTemplate || null,
          }),
        }),
      ])
      const failed = responses.find((res) => !res.ok)
      if (failed) {
        const body = (await failed.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Save failed (${failed.status})`)
      }
    },
    onSuccess: () => {
      toast.success(t.savedToast)
      void queryClient.invalidateQueries({ queryKey: ["operator-profile-settings"] })
      void queryClient.invalidateQueries({ queryKey: ["public-operator-profile"] })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t.saveFailed)
    },
  })

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const setField = <K extends keyof OperatorProfileForm>(key: K, value: OperatorProfileForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <form
      className="mx-auto flex max-w-4xl flex-col gap-6 p-6"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(form)
      }}
    >
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.descriptionPrefix}
          <code>{t.descriptionCodeFragment}</code>
          {t.descriptionSuffix}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t.identity.title}</CardTitle>
          <CardDescription>{t.identity.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="op-name">{t.identity.nameLabel}</Label>
            <Input
              id="op-name"
              value={form.name ?? ""}
              onChange={(e) => setField("name", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-legalName">{t.identity.legalNameLabel}</Label>
            <Input
              id="op-legalName"
              value={form.legalName ?? ""}
              onChange={(e) => setField("legalName", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-vatId">{t.identity.vatIdLabel}</Label>
            <Input
              id="op-vatId"
              value={form.vatId ?? ""}
              onChange={(e) => setField("vatId", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-regNum">{t.identity.registrationNumberLabel}</Label>
            <Input
              id="op-regNum"
              value={form.registrationNumber ?? ""}
              onChange={(e) => setField("registrationNumber", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.contact.title}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="op-address">{t.contact.addressLabel}</Label>
            <Textarea
              id="op-address"
              value={form.address ?? ""}
              onChange={(e) => setField("address", e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-phone">{t.contact.phoneLabel}</Label>
            <Input
              id="op-phone"
              value={form.phone ?? ""}
              onChange={(e) => setField("phone", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-email">{t.contact.emailLabel}</Label>
            <Input
              id="op-email"
              type="email"
              value={form.email ?? ""}
              onChange={(e) => setField("email", e.target.value)}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="op-website">{t.contact.websiteLabel}</Label>
            <Input
              id="op-website"
              type="url"
              value={form.website ?? ""}
              onChange={(e) => setField("website", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.paymentCollection.title}</CardTitle>
          <CardDescription>{t.paymentCollection.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="op-bankTransferBeneficiary">
              {t.paymentCollection.beneficiaryLabel}
            </Label>
            <Input
              id="op-bankTransferBeneficiary"
              value={form.bankTransferBeneficiary ?? ""}
              placeholder={t.paymentCollection.beneficiaryPlaceholder}
              onChange={(e) => setField("bankTransferBeneficiary", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-iban">{t.paymentCollection.ibanLabel}</Label>
            <Input
              id="op-iban"
              value={form.iban ?? ""}
              onChange={(e) => setField("iban", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-bank">{t.paymentCollection.bankLabel}</Label>
            <Input
              id="op-bank"
              value={form.bank ?? ""}
              onChange={(e) => setField("bank", e.target.value)}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="op-notes">{t.paymentCollection.notesLabel}</Label>
            <Textarea
              id="op-notes"
              value={form.notes ?? ""}
              onChange={(e) => setField("notes", e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.license.title}</CardTitle>
          <CardDescription>{t.license.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="op-license">{t.license.licenseLabel}</Label>
            <Input
              id="op-license"
              value={form.license ?? ""}
              onChange={(e) => setField("license", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-licenseAuthority">{t.license.authorityLabel}</Label>
            <Input
              id="op-licenseAuthority"
              value={form.licenseAuthority ?? ""}
              onChange={(e) => setField("licenseAuthority", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.signatory.title}</CardTitle>
          <CardDescription>{t.signatory.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="op-signatoryName">{t.signatory.nameLabel}</Label>
            <Input
              id="op-signatoryName"
              value={form.signatoryName ?? ""}
              onChange={(e) => setField("signatoryName", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-signatoryRole">{t.signatory.roleLabel}</Label>
            <Input
              id="op-signatoryRole"
              placeholder={t.signatory.rolePlaceholder}
              value={form.signatoryRole ?? ""}
              onChange={(e) => setField("signatoryRole", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.defaultPaymentPolicy.title}</CardTitle>
          <CardDescription>{t.defaultPaymentPolicy.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <PaymentPolicyForm
            value={form.customerPaymentPolicy ?? null}
            onChange={(next) => setField("customerPaymentPolicy", next)}
            inheritable={false}
          />
          <PaymentPolicyPreview policy={form.customerPaymentPolicy ?? noDepositPolicy} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.checkoutLinks.title}</CardTitle>
          <CardDescription>{t.checkoutLinks.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="space-y-1">
            <Label htmlFor="op-bookingCheckoutUrlTemplate">
              {t.checkoutLinks.bookingCheckoutUrlTemplateLabel}
            </Label>
            <Input
              id="op-bookingCheckoutUrlTemplate"
              value={form.bookingCheckoutUrlTemplate ?? ""}
              placeholder={t.checkoutLinks.bookingCheckoutUrlTemplatePlaceholder}
              onChange={(e) => setField("bookingCheckoutUrlTemplate", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t.checkoutLinks.bookingCheckoutUrlTemplateHelp}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-invoicePayUrlTemplate">
              {t.checkoutLinks.invoicePayUrlTemplateLabel}
            </Label>
            <Input
              id="op-invoicePayUrlTemplate"
              value={form.invoicePayUrlTemplate ?? ""}
              placeholder={t.checkoutLinks.invoicePayUrlTemplatePlaceholder}
              onChange={(e) => setField("invoicePayUrlTemplate", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t.checkoutLinks.invoicePayUrlTemplateHelp}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t.saveChanges}
        </Button>
      </div>
    </form>
  )
}

export const OperatorSettingsPage = OperatorProfilePage
