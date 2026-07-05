import { referenceAircraft } from "@voyant-travel/flights/reference/local-postgres"

import type { Db } from "./seed-flights-reference-types"

/**
 * Seed ~25 common IATA aircraft type codes. Used to hydrate the segment
 * "Aircraft" line in the offer detail sheet (e.g. "738" → "Boeing 737-800").
 * Covers the workhorses most demo offers will reference plus a handful of
 * widebody types for long-haul itineraries.
 */
export async function seedAircraft(db: Db): Promise<number> {
  const rows: Array<typeof referenceAircraft.$inferInsert> = [
    // ── Boeing narrowbody ──────────────────────────────────────────────────
    {
      iataCode: "738",
      icaoCode: "B738",
      name: "Boeing 737-800",
      manufacturer: "Boeing",
      typicalSeats: 189,
    },
    {
      iataCode: "739",
      icaoCode: "B739",
      name: "Boeing 737-900",
      manufacturer: "Boeing",
      typicalSeats: 215,
    },
    {
      iataCode: "73H",
      icaoCode: "B38M",
      name: "Boeing 737 MAX 8",
      manufacturer: "Boeing",
      typicalSeats: 178,
    },
    {
      iataCode: "7M9",
      icaoCode: "B39M",
      name: "Boeing 737 MAX 9",
      manufacturer: "Boeing",
      typicalSeats: 193,
    },

    // ── Airbus narrowbody ──────────────────────────────────────────────────
    {
      iataCode: "319",
      icaoCode: "A319",
      name: "Airbus A319",
      manufacturer: "Airbus",
      typicalSeats: 144,
    },
    {
      iataCode: "320",
      icaoCode: "A320",
      name: "Airbus A320",
      manufacturer: "Airbus",
      typicalSeats: 180,
    },
    {
      iataCode: "321",
      icaoCode: "A321",
      name: "Airbus A321",
      manufacturer: "Airbus",
      typicalSeats: 220,
    },
    {
      iataCode: "32A",
      icaoCode: "A20N",
      name: "Airbus A320neo",
      manufacturer: "Airbus",
      typicalSeats: 186,
    },
    {
      iataCode: "32Q",
      icaoCode: "A21N",
      name: "Airbus A321neo",
      manufacturer: "Airbus",
      typicalSeats: 232,
    },

    // ── Boeing widebody ────────────────────────────────────────────────────
    {
      iataCode: "763",
      icaoCode: "B763",
      name: "Boeing 767-300",
      manufacturer: "Boeing",
      typicalSeats: 269,
    },
    {
      iataCode: "772",
      icaoCode: "B772",
      name: "Boeing 777-200",
      manufacturer: "Boeing",
      typicalSeats: 314,
    },
    {
      iataCode: "77L",
      icaoCode: "B77L",
      name: "Boeing 777-200LR",
      manufacturer: "Boeing",
      typicalSeats: 317,
    },
    {
      iataCode: "77W",
      icaoCode: "B77W",
      name: "Boeing 777-300ER",
      manufacturer: "Boeing",
      typicalSeats: 396,
    },
    {
      iataCode: "778",
      icaoCode: "B778",
      name: "Boeing 777-8",
      manufacturer: "Boeing",
      typicalSeats: 384,
    },
    {
      iataCode: "779",
      icaoCode: "B779",
      name: "Boeing 777-9",
      manufacturer: "Boeing",
      typicalSeats: 426,
    },
    {
      iataCode: "788",
      icaoCode: "B788",
      name: "Boeing 787-8 Dreamliner",
      manufacturer: "Boeing",
      typicalSeats: 242,
    },
    {
      iataCode: "789",
      icaoCode: "B789",
      name: "Boeing 787-9 Dreamliner",
      manufacturer: "Boeing",
      typicalSeats: 290,
    },
    {
      iataCode: "78J",
      icaoCode: "B78X",
      name: "Boeing 787-10 Dreamliner",
      manufacturer: "Boeing",
      typicalSeats: 330,
    },
    {
      iataCode: "744",
      icaoCode: "B744",
      name: "Boeing 747-400",
      manufacturer: "Boeing",
      typicalSeats: 416,
    },
    {
      iataCode: "748",
      icaoCode: "B748",
      name: "Boeing 747-8",
      manufacturer: "Boeing",
      typicalSeats: 467,
    },

    // ── Airbus widebody ────────────────────────────────────────────────────
    {
      iataCode: "333",
      icaoCode: "A333",
      name: "Airbus A330-300",
      manufacturer: "Airbus",
      typicalSeats: 277,
    },
    {
      iataCode: "339",
      icaoCode: "A339",
      name: "Airbus A330-900neo",
      manufacturer: "Airbus",
      typicalSeats: 287,
    },
    {
      iataCode: "359",
      icaoCode: "A359",
      name: "Airbus A350-900",
      manufacturer: "Airbus",
      typicalSeats: 325,
    },
    {
      iataCode: "351",
      icaoCode: "A35K",
      name: "Airbus A350-1000",
      manufacturer: "Airbus",
      typicalSeats: 369,
    },
    {
      iataCode: "388",
      icaoCode: "A388",
      name: "Airbus A380-800",
      manufacturer: "Airbus",
      typicalSeats: 525,
    },

    // ── Regional ───────────────────────────────────────────────────────────
    {
      iataCode: "E90",
      icaoCode: "E190",
      name: "Embraer E190",
      manufacturer: "Embraer",
      typicalSeats: 100,
    },
    {
      iataCode: "E95",
      icaoCode: "E195",
      name: "Embraer E195",
      manufacturer: "Embraer",
      typicalSeats: 124,
    },
  ]

  await db.insert(referenceAircraft).values(rows).onConflictDoNothing()
  return rows.length
}
