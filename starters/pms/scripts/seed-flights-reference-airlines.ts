import { referenceAirlines } from "@voyant-travel/flights/reference/local-postgres"

import type { Db } from "./seed-flights-reference-types"

const KAYAK_LOGO = (iata: string) => `https://www.kayak.com/h/run/airline-logos/${iata}.png`

/**
 * Seed 30 major airlines spread across oneworld, Star Alliance, SkyTeam,
 * plus a handful of unaligned big names (Gulf carriers, LCCs, etc).
 */
export async function seedAirlines(db: Db): Promise<number> {
  const rows: Array<typeof referenceAirlines.$inferInsert> = [
    // ── oneworld ───────────────────────────────────────────────────────────
    {
      iataCode: "BA",
      icaoCode: "BAW",
      name: "British Airways",
      country: "GB",
      alliance: "oneworld",
      logoUrl: KAYAK_LOGO("BA"),
    },
    {
      iataCode: "AA",
      icaoCode: "AAL",
      name: "American Airlines",
      country: "US",
      alliance: "oneworld",
      logoUrl: KAYAK_LOGO("AA"),
    },
    {
      iataCode: "QR",
      icaoCode: "QTR",
      name: "Qatar Airways",
      country: "QA",
      alliance: "oneworld",
      logoUrl: KAYAK_LOGO("QR"),
    },
    {
      iataCode: "CX",
      icaoCode: "CPA",
      name: "Cathay Pacific",
      country: "HK",
      alliance: "oneworld",
      logoUrl: KAYAK_LOGO("CX"),
    },
    {
      iataCode: "JL",
      icaoCode: "JAL",
      name: "Japan Airlines",
      country: "JP",
      alliance: "oneworld",
      logoUrl: KAYAK_LOGO("JL"),
    },
    {
      iataCode: "QF",
      icaoCode: "QFA",
      name: "Qantas",
      country: "AU",
      alliance: "oneworld",
      logoUrl: KAYAK_LOGO("QF"),
    },
    {
      iataCode: "IB",
      icaoCode: "IBE",
      name: "Iberia",
      country: "ES",
      alliance: "oneworld",
      logoUrl: KAYAK_LOGO("IB"),
    },
    {
      iataCode: "AY",
      icaoCode: "FIN",
      name: "Finnair",
      country: "FI",
      alliance: "oneworld",
      logoUrl: KAYAK_LOGO("AY"),
    },
    {
      iataCode: "EI",
      icaoCode: "EIN",
      name: "Aer Lingus",
      country: "IE",
      alliance: "oneworld",
      logoUrl: KAYAK_LOGO("EI"),
    },

    // ── Star Alliance ──────────────────────────────────────────────────────
    {
      iataCode: "LH",
      icaoCode: "DLH",
      name: "Lufthansa",
      country: "DE",
      alliance: "star-alliance",
      logoUrl: KAYAK_LOGO("LH"),
    },
    {
      iataCode: "UA",
      icaoCode: "UAL",
      name: "United Airlines",
      country: "US",
      alliance: "star-alliance",
      logoUrl: KAYAK_LOGO("UA"),
    },
    {
      iataCode: "AC",
      icaoCode: "ACA",
      name: "Air Canada",
      country: "CA",
      alliance: "star-alliance",
      logoUrl: KAYAK_LOGO("AC"),
    },
    {
      iataCode: "NH",
      icaoCode: "ANA",
      name: "All Nippon Airways",
      country: "JP",
      alliance: "star-alliance",
      logoUrl: KAYAK_LOGO("NH"),
    },
    {
      iataCode: "SQ",
      icaoCode: "SIA",
      name: "Singapore Airlines",
      country: "SG",
      alliance: "star-alliance",
      logoUrl: KAYAK_LOGO("SQ"),
    },
    {
      iataCode: "TG",
      icaoCode: "THA",
      name: "Thai Airways International",
      country: "TH",
      alliance: "star-alliance",
      logoUrl: KAYAK_LOGO("TG"),
    },
    {
      iataCode: "TK",
      icaoCode: "THY",
      name: "Turkish Airlines",
      country: "TR",
      alliance: "star-alliance",
      logoUrl: KAYAK_LOGO("TK"),
    },
    {
      iataCode: "NZ",
      icaoCode: "ANZ",
      name: "Air New Zealand",
      country: "NZ",
      alliance: "star-alliance",
      logoUrl: KAYAK_LOGO("NZ"),
    },

    // ── SkyTeam ────────────────────────────────────────────────────────────
    {
      iataCode: "AF",
      icaoCode: "AFR",
      name: "Air France",
      country: "FR",
      alliance: "skyteam",
      logoUrl: KAYAK_LOGO("AF"),
    },
    {
      iataCode: "KL",
      icaoCode: "KLM",
      name: "KLM Royal Dutch Airlines",
      country: "NL",
      alliance: "skyteam",
      logoUrl: KAYAK_LOGO("KL"),
    },
    {
      iataCode: "DL",
      icaoCode: "DAL",
      name: "Delta Air Lines",
      country: "US",
      alliance: "skyteam",
      logoUrl: KAYAK_LOGO("DL"),
    },
    {
      iataCode: "KE",
      icaoCode: "KAL",
      name: "Korean Air",
      country: "KR",
      alliance: "skyteam",
      logoUrl: KAYAK_LOGO("KE"),
    },
    {
      iataCode: "AZ",
      icaoCode: "ITY",
      name: "ITA Airways",
      country: "IT",
      alliance: "skyteam",
      logoUrl: KAYAK_LOGO("AZ"),
    },
    {
      iataCode: "VN",
      icaoCode: "HVN",
      name: "Vietnam Airlines",
      country: "VN",
      alliance: "skyteam",
      logoUrl: KAYAK_LOGO("VN"),
    },

    // ── Unaligned ──────────────────────────────────────────────────────────
    { iataCode: "EK", icaoCode: "UAE", name: "Emirates", country: "AE", logoUrl: KAYAK_LOGO("EK") },
    {
      iataCode: "EY",
      icaoCode: "ETD",
      name: "Etihad Airways",
      country: "AE",
      logoUrl: KAYAK_LOGO("EY"),
    },
    {
      iataCode: "B6",
      icaoCode: "JBU",
      name: "JetBlue Airways",
      country: "US",
      logoUrl: KAYAK_LOGO("B6"),
    },
    {
      iataCode: "VS",
      icaoCode: "VIR",
      name: "Virgin Atlantic",
      country: "GB",
      logoUrl: KAYAK_LOGO("VS"),
    },
    { iataCode: "SU", icaoCode: "AFL", name: "Aeroflot", country: "RU", logoUrl: KAYAK_LOGO("SU") },
    {
      iataCode: "SA",
      icaoCode: "SAA",
      name: "South African Airways",
      country: "ZA",
      logoUrl: KAYAK_LOGO("SA"),
    },
    { iataCode: "U2", icaoCode: "EZY", name: "easyJet", country: "GB", logoUrl: KAYAK_LOGO("U2") },
    { iataCode: "FR", icaoCode: "RYR", name: "Ryanair", country: "IE", logoUrl: KAYAK_LOGO("FR") },
  ]

  await db.insert(referenceAirlines).values(rows).onConflictDoNothing()
  return rows.length
}
