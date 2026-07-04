import { describe, expect, it } from "vitest"

import { buildPropertyCards, cardToPropertyVM, hitToPropertyVM } from "./property-card-model"

describe("cardToPropertyVM", () => {
  it("maps a storefront-card projection", () => {
    expect(
      cardToPropertyVM({
        id: "acc_1",
        name: "Hotel Splendid",
        media: { thumbnailUrl: "thumb.jpg", coverMediaUrl: "cover.jpg" },
        priceFrom: { amountCents: 12_000, currency: "EUR" },
        destinations: { cities: ["Nice"], countries: ["France"], regions: [] },
      }),
    ).toEqual({
      id: "acc_1",
      name: "Hotel Splendid",
      location: "Nice, France",
      imageUrl: "cover.jpg",
      priceFromMinor: 12_000,
      currency: "EUR",
    })
  })

  it("falls back to thumbnail and id, tolerates missing price", () => {
    const vm = cardToPropertyVM({
      id: "acc_2",
      name: null,
      media: { thumbnailUrl: "t.jpg", coverMediaUrl: null },
      priceFrom: null,
      destinations: { cities: [], countries: ["Spain"], regions: [] },
    })
    expect(vm).toMatchObject({ id: "acc_2", name: "acc_2", imageUrl: "t.jpg", location: "Spain" })
    expect(vm.priceFromMinor).toBeUndefined()
  })
})

describe("hitToPropertyVM", () => {
  it("reads raw Typesense fields with name/price fallbacks", () => {
    expect(
      hitToPropertyVM({
        id: "acc_3",
        document: {
          fields: {
            name: "Seaside Inn",
            city: "Split",
            country: "Croatia",
            hero_image_url: "hero.jpg",
            price_cents: "9900",
            currency: "EUR",
          },
        },
      }),
    ).toEqual({
      id: "acc_3",
      name: "Seaside Inn",
      location: "Split, Croatia",
      imageUrl: "hero.jpg",
      priceFromMinor: 9900,
      currency: "EUR",
    })
  })
})

describe("buildPropertyCards", () => {
  it("prefers the cards projection when present", () => {
    const result = {
      hits: [{ id: "raw", document: { fields: { name: "raw" } } }],
      cards: [
        {
          id: "acc_1",
          name: "Card Hotel",
          media: { thumbnailUrl: null, coverMediaUrl: null },
          priceFrom: null,
          destinations: { cities: [], countries: [], regions: [] },
        },
      ],
    }
    expect(buildPropertyCards(result).map((c) => c.id)).toEqual(["acc_1"])
  })

  it("falls back to hits when there are no cards", () => {
    const result = { hits: [{ id: "acc_9", document: { fields: { name: "Hit Hotel" } } }] }
    expect(buildPropertyCards(result).map((c) => c.name)).toEqual(["Hit Hotel"])
  })

  it("is empty for undefined", () => {
    expect(buildPropertyCards(undefined)).toEqual([])
  })
})
