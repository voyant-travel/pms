"use client"

import { useLocale } from "@voyant-travel/admin/providers/locale"
import {
  createLocaleFormatters,
  createPackageMessagesContext,
  type LocaleMessageDefinitions,
  type PackageI18nValue,
} from "@voyant-travel/i18n"
import type { ReactNode } from "react"

/**
 * App-owned i18n for the operator starter's customer-facing surfaces — the
 * `(storefront)` route group plus the standalone public pages (`/pay`,
 * `/proposal/$id`). These render to customers/external parties, not the
 * operator, but they live inside the same `AdminProvider` (mounted at
 * `__root`), so the customer locale is read from the shared
 * `useLocale().resolvedLocale` — the same `en`/`ro` selection the workspace
 * uses. Mirrors the package i18n pattern (`createPackageMessagesContext`).
 *
 * Romanian strings follow the codebase convention of ASCII (no diacritics),
 * matching the operator admin message files.
 */

const fallbackLocale = "en"

export const storefrontMessagesEn = {
  layout: {
    brand: "Voyant Storefront",
    signIn: "Sign in",
  },
  pay: {
    missingIdentifierTitle: "Payment link missing identifier",
    missingIdentifierBody:
      "The link you followed didn't include a payment reference. Please contact your travel agent for a fresh link.",
    lookingUp: "Looking up your payment…",
    notFoundTitle: "Payment link not found",
    notFoundBody:
      "This payment link is invalid or has been removed. Please contact your travel agent for a fresh link.",
    retryFailed: "Couldn't create a fresh payment link.",
  },
  proposal: {
    unavailableTitle: "Proposal unavailable",
    noLongerAvailable: "This proposal is no longer available.",
    notFound: "Proposal not found",
    declineFailed: "Could not decline proposal",
    acceptFailed: "Could not accept proposal",
    requestFailed: "Request failed",
    operatorFallbackName: "Your travel specialist",
    operatorContactFallback: "Travel specialist",
    metricTotal: "Total",
    validUntil: "Valid until",
    statusLabel: "Status",
    colItem: "Item",
    colQty: "Qty",
    colPrice: "Price",
    colTotal: "Total",
    noLines: "No proposal lines",
    subtotal: "Subtotal",
    tax: "Tax",
    accept: "Accept",
    accepting: "Accepting...",
    decline: "Decline",
    declining: "Declining...",
    declineConfirm: "Decline this proposal?",
    notSet: "Not set",
    statuses: {
      draft: "Draft",
      sent: "Sent",
      accepted: "Accepted",
      declined: "Declined",
      expired: "Expired",
    },
  },
  shop: {
    heading: "Browse and book",
    intro:
      "Customer-facing booking journey. Same engine the operator uses, served via /v1/public/catalog/* with an unauthenticated customer actor.",
    buildTrip: "Build a trip",
    searchPlaceholder: "Search products, tours, stays…",
    verticalProducts: "Tours & products",
    verticalCruises: "Cruises",
    verticalAccommodations: "Stays",
    verticalCharters: "Charters",
    unavailableTitle: "Catalog search isn't configured",
    unavailableBody:
      "The search indexer is offline (typically because TYPESENSE_HOST isn't set). You can still demo the booking journey directly — pick a product id from the operator dashboard and visit:",
    viewAndBook: "View & book",
    percentOff: "{percent}% off",
    amountOff: "{amount} off",
    emptyPrefix: "No",
    emptyMatch: "match",
    emptyYourFilters: "your filters",
    emptySuffix: "Try a broader query or a different vertical.",
  },
  shopDetailShared: {
    priceFrom: "from {amount}",
    pricePending: "Pending",
    bookThis: "Book this",
    guestSingular: "guest",
    guestPlural: "guests",
    subtotal: "Subtotal",
    book: "Book",
    noChargeYet: "You won't be charged yet. The next step collects traveler details.",
    departure: "Departure",
    departuresUnavailable: "Departures unavailable.",
    noUpcomingDepartures: "No upcoming departures.",
    travelers: "Travelers",
    adults: "Adults",
    adultsHint: "12 yrs+",
    children: "Children",
    childrenHint: "2–11 yrs",
    infants: "Infants",
    infantsHint: "under 2",
    servedIn: "Served in {locale}",
    machineTranslated: "Machine-translated",
    limitedContent: "Limited content available",
    refreshing: "Refreshing in the background",
    backToAll: "← Back to all",
    slotLeft: "left",
    nightsShort: "{count}n",
    daysShort: "{count}d",
    detailUnavailable: "Detail content isn't available for this item yet.",
    invalidUnavailable: "This product is currently unavailable.",
    invalidDepartureNotFound: "This departure is no longer available. Choose another departure.",
    invalidDepartureUnavailable: "This departure is sold out or closed. Choose another departure.",
    invalidNoSellAmount: "Pricing isn't configured for this item yet.",
    invalidProductNotFound: "Product not found.",
    invalidCruiseNotFound: "Cruise not found.",
    invalidPropertyNotFound: "Property not found.",
    invalidNoPriceForOccupancy: "No price for the chosen cabin and occupancy.",
  },
  shopDetailAccommodations: {
    checkIn: "Check-in",
    checkOut: "Check-out",
    chooseRoom: "Choose a room",
    sleepsUpTo: "Sleeps up to {count}",
    ratePlan: "Rate plan",
    cancellation: "Cancellation: {policy}",
    includes: "Includes: {inclusions}",
  },
  shopDetailCruises: {
    occupancy: "Occupancy",
    guestsInCabin: "Guests in cabin",
    perPaxPricing: "Per-pax pricing",
    aboard: "Aboard",
    nights: "{count} nights",
    chooseSailing: "Choose a sailing",
    colDate: "Date",
    colRoute: "Route",
    colNights: "Nights",
    colStatus: "Status",
    soldOut: "Sold out",
    available: "Available",
    chooseCabin: "Choose a cabin",
    pricingPerGuest:
      "Pricing is per guest at occupancy {occupancy}; the sidebar total reflects the cabin charge.",
    guestsCount: "{count} guests",
    decksCount: "{count} decks",
    builtYear: "Built {year}",
    deckPlan: "Deck plan",
    openDeckPlan: "Open deck plan",
    deckLabel: "Deck {level}: {name}",
    wheelchairAccessible: "Wheelchair accessible",
    sleeps: "Sleeps {count}",
    grades: "Grades {codes}",
    floorPlan: "Floor plan",
  },
  shopDetailProducts: {
    highlights: "Highlights",
    itinerary: "Itinerary",
    day: "Day {number}",
    gallery: "Gallery",
    policies: "Policies",
  },
  confirmation: {
    bankTransferTitle: "Reservation pending bank transfer",
    bankTransferIntro:
      "Your reservation is held while we wait for your payment to land. Use the details below when you initiate the bank transfer — please include the reference exactly so we can match the payment to your booking.",
    bookingReference: "Booking reference",
    proformaNumber: "Proforma number",
    beneficiary: "Beneficiary",
    bank: "Bank",
    iban: "IBAN",
    reference: "Reference",
    amount: "Amount",
    dueBy: "Due by",
    bankTransferEmailed:
      "Your bank-transfer instructions were also emailed to you. Check your inbox.",
    bankTransferFollowUp:
      "Once we receive the payment we'll generate your final invoice and contract automatically and email them through.",
    paymentNotCompletedTitle: "Payment not completed",
    paymentNotCompletedBody:
      "The card processor did not confirm this payment. If money left your account, contact us with the booking reference so we can reconcile it.",
    processingTitle: "Processing your payment",
    processingBody:
      "We're waiting for the card processor to confirm your payment. This page will update once we hear back — usually within a minute. You can also close this tab; we'll email you the contract and invoice once the booking is confirmed.",
    confirmedTitle: "Thank you — your booking is confirmed",
    paymentReceived: "Payment received:",
    confirmedFollowUp:
      "We'll email your contract and invoice shortly. You can safely close this tab.",
    inquiryTitle: "Inquiry received",
    inquiryBody:
      "Thanks — we've got your details and will reach out with availability and a quote.",
    referenceLabel: "Reference:",
    holdTitle: "Booking on hold",
    holdBody:
      "We've placed a hold on your reservation. Our team will reach out to confirm the next steps.",
    defaultTitle: "Booking confirmed",
    defaultBody:
      "We've placed a hold on your reservation. You'll receive a confirmation email shortly with the next steps.",
    backToStorefront: "Back to storefront",
  },
  bookingJourney: {
    marketingLabel: "Email me occasional updates about new tours and promotions.",
  },
}

export type StorefrontMessages = typeof storefrontMessagesEn

export const storefrontMessagesRo: StorefrontMessages = {
  layout: {
    brand: "Magazin Voyant",
    signIn: "Autentificare",
  },
  pay: {
    missingIdentifierTitle: "Linkul de plata nu contine un identificator",
    missingIdentifierBody:
      "Linkul accesat nu continea o referinta de plata. Contacteaza agentul tau de turism pentru un link nou.",
    lookingUp: "Cautam plata ta…",
    notFoundTitle: "Linkul de plata nu a fost gasit",
    notFoundBody:
      "Acest link de plata este invalid sau a fost eliminat. Contacteaza agentul tau de turism pentru un link nou.",
    retryFailed: "Nu am putut crea un link de plata nou.",
  },
  proposal: {
    unavailableTitle: "Oferta indisponibila",
    noLongerAvailable: "Aceasta oferta nu mai este disponibila.",
    notFound: "Oferta negasita",
    declineFailed: "Nu am putut respinge oferta",
    acceptFailed: "Nu am putut accepta oferta",
    requestFailed: "Cererea a esuat",
    operatorFallbackName: "Specialistul tau de turism",
    operatorContactFallback: "Specialist de turism",
    metricTotal: "Total",
    validUntil: "Valabil pana la",
    statusLabel: "Status",
    colItem: "Articol",
    colQty: "Cant.",
    colPrice: "Pret",
    colTotal: "Total",
    noLines: "Nicio linie in oferta",
    subtotal: "Subtotal",
    tax: "Taxe",
    accept: "Accepta",
    accepting: "Se accepta...",
    decline: "Respinge",
    declining: "Se respinge...",
    declineConfirm: "Respingi aceasta oferta?",
    notSet: "Nestabilit",
    statuses: {
      draft: "Ciorna",
      sent: "Trimisa",
      accepted: "Acceptata",
      declined: "Respinsa",
      expired: "Expirata",
    },
  },
  shop: {
    heading: "Cauta si rezerva",
    intro:
      "Parcurs de rezervare pentru clienti. Acelasi motor folosit de operator, servit prin /v1/public/catalog/* cu un actor customer neautentificat.",
    buildTrip: "Construieste o calatorie",
    searchPlaceholder: "Cauta produse, tururi, sejururi…",
    verticalProducts: "Tururi si produse",
    verticalCruises: "Croaziere",
    verticalAccommodations: "Sejururi",
    verticalCharters: "Charter",
    unavailableTitle: "Cautarea in catalog nu este configurata",
    unavailableBody:
      "Indexul de cautare este offline (de obicei pentru ca TYPESENSE_HOST nu este setat). Poti totusi testa parcursul de rezervare direct — alege un id de produs din panoul operatorului si viziteaza:",
    viewAndBook: "Vezi si rezerva",
    percentOff: "{percent}% reducere",
    amountOff: "{amount} reducere",
    emptyPrefix: "Niciun",
    emptyMatch: "nu corespunde",
    emptyYourFilters: "filtrelor tale",
    emptySuffix: "Incearca o cautare mai larga sau alta categorie.",
  },
  shopDetailShared: {
    priceFrom: "de la {amount}",
    pricePending: "In asteptare",
    bookThis: "Rezerva acest produs",
    guestSingular: "oaspete",
    guestPlural: "oaspeti",
    subtotal: "Subtotal",
    book: "Rezerva",
    noChargeYet: "Nu vei fi taxat inca. Pasul urmator colecteaza detaliile calatorilor.",
    departure: "Plecare",
    departuresUnavailable: "Plecari indisponibile.",
    noUpcomingDepartures: "Nicio plecare in viitor.",
    travelers: "Calatori",
    adults: "Adulti",
    adultsHint: "12 ani+",
    children: "Copii",
    childrenHint: "2–11 ani",
    infants: "Bebelusi",
    infantsHint: "sub 2 ani",
    servedIn: "Servit in {locale}",
    machineTranslated: "Tradus automat",
    limitedContent: "Continut limitat disponibil",
    refreshing: "Se reimprospateaza in fundal",
    backToAll: "← Inapoi la toate",
    slotLeft: "ramase",
    nightsShort: "{count}n",
    daysShort: "{count}z",
    detailUnavailable: "Continutul detaliat nu este inca disponibil pentru acest produs.",
    invalidUnavailable: "Acest produs este momentan indisponibil.",
    invalidDepartureNotFound: "Aceasta plecare nu mai este disponibila. Alege alta plecare.",
    invalidDepartureUnavailable: "Aceasta plecare este epuizata sau inchisa. Alege alta plecare.",
    invalidNoSellAmount: "Preturile nu sunt inca configurate pentru acest produs.",
    invalidProductNotFound: "Produs negasit.",
    invalidCruiseNotFound: "Croaziera negasita.",
    invalidPropertyNotFound: "Proprietate negasita.",
    invalidNoPriceForOccupancy: "Niciun pret pentru cabina si ocuparea alese.",
  },
  shopDetailAccommodations: {
    checkIn: "Check-in",
    checkOut: "Check-out",
    chooseRoom: "Alege o camera",
    sleepsUpTo: "Dormeste pana la {count}",
    ratePlan: "Plan tarifar",
    cancellation: "Anulare: {policy}",
    includes: "Include: {inclusions}",
  },
  shopDetailCruises: {
    occupancy: "Ocupare",
    guestsInCabin: "Oaspeti in cabina",
    perPaxPricing: "Pret per persoana",
    aboard: "La bord",
    nights: "{count} nopti",
    chooseSailing: "Alege o navigare",
    colDate: "Data",
    colRoute: "Ruta",
    colNights: "Nopti",
    colStatus: "Status",
    soldOut: "Epuizat",
    available: "Disponibil",
    chooseCabin: "Alege o cabina",
    pricingPerGuest:
      "Pretul este per oaspete la ocuparea {occupancy}; totalul din bara laterala reflecta tariful cabinei.",
    guestsCount: "{count} oaspeti",
    decksCount: "{count} punti",
    builtYear: "Construit {year}",
    deckPlan: "Plan punte",
    openDeckPlan: "Deschide planul puntii",
    deckLabel: "Puntea {level}: {name}",
    wheelchairAccessible: "Accesibil cu scaun cu rotile",
    sleeps: "Dormeste {count}",
    grades: "Categorii {codes}",
    floorPlan: "Plan etaj",
  },
  shopDetailProducts: {
    highlights: "Puncte forte",
    itinerary: "Itinerar",
    day: "Ziua {number}",
    gallery: "Galerie",
    policies: "Politici",
  },
  confirmation: {
    bankTransferTitle: "Rezervare in asteptarea transferului bancar",
    bankTransferIntro:
      "Rezervarea ta este pastrata cat timp asteptam plata. Foloseste detaliile de mai jos cand initiezi transferul bancar — te rugam sa incluzi referinta exact pentru a putea asocia plata cu rezervarea ta.",
    bookingReference: "Referinta rezervare",
    proformaNumber: "Numar proforma",
    beneficiary: "Beneficiar",
    bank: "Banca",
    iban: "IBAN",
    reference: "Referinta",
    amount: "Suma",
    dueBy: "Scadent la",
    bankTransferEmailed:
      "Instructiunile de transfer bancar ti-au fost trimise si pe email. Verifica-ti inbox-ul.",
    bankTransferFollowUp:
      "Dupa ce primim plata vom genera automat factura finala si contractul si ti le vom trimite pe email.",
    paymentNotCompletedTitle: "Plata nu a fost finalizata",
    paymentNotCompletedBody:
      "Procesatorul de carduri nu a confirmat aceasta plata. Daca ti s-au retras bani din cont, contacteaza-ne cu referinta rezervarii pentru a o reconcilia.",
    processingTitle: "Se proceseaza plata ta",
    processingBody:
      "Asteptam ca procesatorul de carduri sa confirme plata ta. Aceasta pagina se va actualiza dupa ce primim raspuns — de obicei intr-un minut. Poti inchide si aceasta fila; iti vom trimite pe email contractul si factura dupa ce rezervarea este confirmata.",
    confirmedTitle: "Multumim — rezervarea ta este confirmata",
    paymentReceived: "Plata primita:",
    confirmedFollowUp:
      "Iti vom trimite pe email contractul si factura in scurt timp. Poti inchide aceasta fila.",
    inquiryTitle: "Cerere primita",
    inquiryBody:
      "Multumim — am primit detaliile tale si te vom contacta cu disponibilitate si o oferta.",
    referenceLabel: "Referinta:",
    holdTitle: "Rezervare in asteptare",
    holdBody:
      "Am pastrat o rezervare pentru tine. Echipa noastra te va contacta pentru a confirma pasii urmatori.",
    defaultTitle: "Rezervare confirmata",
    defaultBody:
      "Am pastrat o rezervare pentru tine. Vei primi in scurt timp un email de confirmare cu pasii urmatori.",
    backToStorefront: "Inapoi la magazin",
  },
  bookingJourney: {
    marketingLabel: "Trimite-mi ocazional noutati despre tururi noi si promotii.",
  },
}

const storefrontMessageDefinitions = {
  en: storefrontMessagesEn,
  ro: storefrontMessagesRo,
} satisfies LocaleMessageDefinitions<StorefrontMessages>

const storefrontContext = createPackageMessagesContext<StorefrontMessages>("StorefrontMessages")

const defaultStorefrontI18n: PackageI18nValue<StorefrontMessages> = {
  messages: storefrontMessagesEn,
  ...createLocaleFormatters(fallbackLocale),
}

/**
 * Resolves the customer locale from the shared admin `LocaleProvider`
 * (mounted at `__root`) and supplies the matching storefront messages.
 */
export function StorefrontMessagesProvider({ children }: { children: ReactNode }) {
  const { resolvedLocale } = useLocale()

  return (
    <storefrontContext.ResolvedMessagesProvider
      definitions={storefrontMessageDefinitions}
      fallbackLocale={fallbackLocale}
      locale={resolvedLocale}
    >
      {children}
    </storefrontContext.ResolvedMessagesProvider>
  )
}

export const useStorefrontI18n = storefrontContext.useI18n
export const useStorefrontMessages = storefrontContext.useMessages

export function useStorefrontMessagesOrDefault(): StorefrontMessages {
  return storefrontContext.useOptionalI18n()?.messages ?? defaultStorefrontI18n.messages
}
