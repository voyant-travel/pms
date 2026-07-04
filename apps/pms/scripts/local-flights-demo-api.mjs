import http from "node:http"

const host = process.env.FLIGHTS_DEMO_HOST ?? "127.0.0.1"
const port = Number(process.env.FLIGHTS_DEMO_PORT ?? 3320)
const orders = new Map()
let orderCounter = 0

function json(response, status, body) {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,idempotency-key,x-correlation-id,x-request-id",
    "content-type": "application/json",
  })
  response.end(JSON.stringify(body))
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = ""
    request.setEncoding("utf8")
    request.on("data", (chunk) => {
      body += chunk
    })
    request.on("end", () => {
      try {
        resolve(body.length > 0 ? JSON.parse(body) : {})
      } catch (error) {
        reject(error)
      }
    })
    request.on("error", reject)
  })
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

function makeSegment(slice, sliceIndex, variant) {
  const departAt = new Date(`${slice.departureDate}T${variant === "morning" ? "08:15:00" : "14:35:00"}Z`)
  const stops = variant === "connection" ? 1 : 0
  const carrierCode = variant === "premium" ? "VO" : "VX"
  if (stops === 0) {
    return [
      {
        segmentId: `seg_${sliceIndex + 1}_${variant}_1`,
        carrierCode,
        flightNumber: `${sliceIndex + 7}${variant === "morning" ? "10" : "42"}`,
        departure: { iataCode: slice.origin, terminal: "1", at: departAt.toISOString() },
        arrival: { iataCode: slice.destination, terminal: "2", at: addHours(departAt, 2.5).toISOString() },
        duration: "PT2H30M",
        aircraft: "320",
        cabin: "economy",
        fareClass: variant === "premium" ? "Y" : "M",
        fareBasis: variant === "premium" ? "YFLEX" : "MDEMO",
      },
    ]
  }
  const connect = "FRA"
  return [
    {
      segmentId: `seg_${sliceIndex + 1}_${variant}_1`,
      carrierCode,
      flightNumber: `${sliceIndex + 6}18`,
      departure: { iataCode: slice.origin, terminal: "1", at: departAt.toISOString() },
      arrival: { iataCode: connect, terminal: "A", at: addHours(departAt, 1.7).toISOString() },
      duration: "PT1H42M",
      aircraft: "319",
      cabin: "economy",
      fareClass: "K",
      fareBasis: "KDEMO",
    },
    {
      segmentId: `seg_${sliceIndex + 1}_${variant}_2`,
      carrierCode,
      flightNumber: `${sliceIndex + 8}64`,
      departure: { iataCode: connect, terminal: "A", at: addHours(departAt, 3).toISOString() },
      arrival: { iataCode: slice.destination, terminal: "2", at: addHours(departAt, 5.2).toISOString() },
      duration: "PT2H12M",
      aircraft: "321",
      cabin: "economy",
      fareClass: "K",
      fareBasis: "KDEMO",
    },
  ]
}

function makeOffer(request, variant, index) {
  const sliceCount = request.slices?.length || 1
  const pax =
    Number(request.passengers?.adults ?? 1) +
    Number(request.passengers?.children ?? 0) +
    Number(request.passengers?.infants ?? 0)
  const base = variant === "premium" ? 240 : variant === "connection" ? 150 : 180
  const total = base * Math.max(1, pax) * sliceCount + index * 33
  const itineraries = (request.slices ?? []).map((slice, sliceIndex) => ({
    segments: makeSegment(slice, sliceIndex, variant),
    duration: variant === "connection" ? "PT5H12M" : "PT2H30M",
  }))
  return {
    offerId: `demo_${variant}_${Buffer.from(JSON.stringify(request.slices ?? [])).toString("base64url").slice(0, 12)}_${pax}`,
    source: "demo",
    itineraries,
    fareBreakdowns: [
      {
        passengerType: "adult",
        passengerCount: Math.max(1, Number(request.passengers?.adults ?? 1)),
        baseFare: { amount: String(Math.max(50, total - 42)), currency: "EUR" },
        taxes: { amount: "42.00", currency: "EUR" },
        total: { amount: total.toFixed(2), currency: "EUR" },
        fareFamily: variant === "premium" ? "Plus" : "Standard",
      },
    ],
    totalPrice: { amount: total.toFixed(2), currency: "EUR" },
    validatingCarrier: variant === "premium" ? "VO" : "VX",
    expiresAt: addHours(new Date(), 3).toISOString(),
    lastTicketingDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    instantTicketing: variant === "premium",
    fareBundles: [
      {
        id: "basic",
        label: "Demo Basic",
        tier: "basic",
        priceDelta: { amount: "0.00", currency: "EUR" },
        inclusions: {
          cabinBag: { included: true, weightKg: 8 },
          checkedBag: { included: false },
          seatSelection: "none",
          refundable: false,
          changeable: false,
        },
      },
      {
        id: "standard",
        label: "Demo Standard",
        tier: "standard",
        priceDelta: { amount: "35.00", currency: "EUR" },
        recommended: true,
        inclusions: {
          cabinBag: { included: true, weightKg: 10 },
          checkedBag: { included: true, pieces: 1, weightKg: 20 },
          seatSelection: "standard",
          priorityBoarding: true,
          refundable: false,
          changeable: true,
        },
      },
      {
        id: "plus",
        label: "Demo Plus",
        tier: "plus",
        priceDelta: { amount: "90.00", currency: "EUR" },
        inclusions: {
          cabinBag: { included: true, weightKg: 10 },
          checkedBag: { included: true, pieces: 2, weightKg: 23 },
          seatSelection: "free",
          priorityBoarding: true,
          loungeAccess: true,
          refundable: true,
          changeable: true,
        },
      },
    ],
    providerData: { localDemo: true, variant },
  }
}

function ancillaryCatalog() {
  return {
    catalog: {
      baggage: [
        {
          id: "bag20",
          label: "20 kg checked bag",
          category: "checked",
          weightKg: 20,
          price: { amount: "45.00", currency: "EUR" },
          recommended: true,
        },
        {
          id: "sports",
          label: "Sports equipment",
          category: "sports",
          weightKg: 23,
          price: { amount: "70.00", currency: "EUR" },
        },
      ],
      assistance: [
        { id: "wchr", label: "Wheelchair assistance", category: "wheelchair", notes: "Free airport assistance." },
      ],
      extras: [
        {
          id: "priority",
          label: "Priority boarding",
          category: "priority",
          price: { amount: "12.00", currency: "EUR" },
        },
      ],
    },
    validUntil: addHours(new Date(), 2).toISOString(),
  }
}

function seatMap(body) {
  const segmentId = body.segmentId ?? body.offer?.itineraries?.[0]?.segments?.[0]?.segmentId ?? "seg_1"
  return {
    seatMap: {
      segmentId,
      aircraft: "320",
      cabin: "economy",
      columnLayout: ["A", "B", "C", null, "D", "E", "F"],
      rows: Array.from({ length: 6 }, (_, index) => {
        const row = index + 8
        return {
          row,
          seats: ["A", "B", "C", "D", "E", "F"].map((column) => ({
            seatNumber: `${row}${column}`,
            row,
            column,
            status: row === 9 && column === "C" ? "blocked" : "available",
            category: row === 8 ? "extra_legroom" : column === "A" || column === "F" ? "preferred" : "standard",
            price: row === 8 ? { amount: "28.00", currency: "EUR" } : { amount: "9.00", currency: "EUR" },
            window: column === "A" || column === "F",
            aisle: column === "C" || column === "D",
          })),
        }
      }),
    },
    validUntil: addHours(new Date(), 2).toISOString(),
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`)
  if (request.method === "OPTIONS") {
    json(response, 204, {})
    return
  }
  if (request.method === "GET" && url.pathname === "/health") {
    json(response, 200, { ok: true, orders: orders.size })
    return
  }
  try {
    if (request.method === "POST" && url.pathname === "/search") {
      const body = await readJson(request)
      const variants = body.searchOptions?.directOnly ? ["morning", "premium"] : ["morning", "connection", "premium"]
      json(response, 200, {
        offers: variants.map((variant, index) => makeOffer(body, variant, index)),
        pagination: { total: variants.length, hasMore: false },
        providerData: { localDemo: true },
      })
      return
    }
    if (request.method === "POST" && url.pathname === "/price") {
      const body = await readJson(request)
      if (!body.offer) {
        json(response, 400, { error: "offer_required" })
        return
      }
      json(response, 200, { offer: body.offer, valid: true })
      return
    }
    if (request.method === "POST" && url.pathname === "/book") {
      const body = await readJson(request)
      if (!body.offer) {
        json(response, 400, { error: "offer_required" })
        return
      }
      orderCounter += 1
      const orderId = `demo_order_${orderCounter}`
      const now = new Date().toISOString()
      const ticketed = body.paymentIntent?.type === "card" || body.paymentIntent?.type === "ticket_on_credit"
      const order = {
        orderId,
        pnr: `VD${String(orderCounter).padStart(4, "0")}`,
        status: ticketed ? "ticketed" : "confirmed",
        offer: body.offer,
        passengers: body.passengers ?? [],
        contact: body.contact ?? {},
        tickets: ticketed
          ? (body.passengers ?? []).map((passenger) => ({
              ticketNumber: `176${String(orderCounter).padStart(7, "0")}`,
              passengerId: passenger.passengerId,
              segmentIds: body.offer.itineraries.flatMap((itinerary) =>
                itinerary.segments.map((segment) => segment.segmentId),
              ),
              status: "issued",
            }))
          : undefined,
        totalPrice: body.offer.totalPrice,
        paymentDeadline: ticketed ? undefined : addHours(new Date(), 24).toISOString(),
        createdAt: now,
        updatedAt: now,
        providerData: { localDemo: true, ancillaries: body.ancillaries ?? null },
      }
      orders.set(orderId, order)
      json(response, 200, { order })
      return
    }
    if (request.method === "POST" && url.pathname === "/ancillaries") {
      json(response, 200, ancillaryCatalog())
      return
    }
    if (request.method === "POST" && url.pathname === "/seatmap") {
      json(response, 200, seatMap(await readJson(request)))
      return
    }
    if (request.method === "POST" && url.pathname === "/seat-selection") {
      const body = await readJson(request)
      const order = orders.get(body.orderId)
      if (!order) {
        json(response, 404, { error: "order_not_found" })
        return
      }
      const updated = {
        ...order,
        updatedAt: new Date().toISOString(),
        providerData: { ...order.providerData, seats: body.seats ?? [] },
      }
      orders.set(body.orderId, updated)
      json(response, 200, { order: updated })
      return
    }
    if (request.method === "GET" && url.pathname === "/orders") {
      const q = url.searchParams.get("q")?.toLowerCase()
      const status = new Set(url.searchParams.getAll("status"))
      const result = Array.from(orders.values()).filter((order) => {
        if (status.size > 0 && !status.has(order.status)) return false
        if (!q) return true
        return (
          order.orderId.toLowerCase().includes(q) ||
          order.pnr?.toLowerCase().includes(q) ||
          order.passengers.some((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q))
        )
      })
      json(response, 200, { orders: result, pagination: { total: result.length, hasMore: false } })
      return
    }
    const orderMatch = url.pathname.match(/^\/orders\/([^/]+)(?:\/cancel)?$/)
    if (orderMatch && request.method === "GET") {
      const order = orders.get(decodeURIComponent(orderMatch[1]))
      json(response, order ? 200 : 404, order ? { order } : { error: "order_not_found" })
      return
    }
    if (orderMatch && request.method === "POST" && url.pathname.endsWith("/cancel")) {
      const orderId = decodeURIComponent(orderMatch[1])
      const order = orders.get(orderId)
      if (!order) {
        json(response, 404, { error: "order_not_found" })
        return
      }
      const updated = { ...order, status: "cancelled", updatedAt: new Date().toISOString() }
      orders.set(orderId, updated)
      json(response, 200, {
        order: updated,
        refundedAmount: order.status === "ticketed" ? { amount: "25.00", currency: order.totalPrice.currency } : undefined,
      })
      return
    }
    json(response, 404, { error: "not_found" })
  } catch (error) {
    json(response, 500, { error: error instanceof Error ? error.message : String(error) })
  }
})

server.listen(port, host, () => {
  console.error(`Local flights demo API listening at http://${host}:${port}`)
})

process.on("SIGINT", () => server.close(() => process.exit(0)))
process.on("SIGTERM", () => server.close(() => process.exit(0)))
