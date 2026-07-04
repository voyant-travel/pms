import http from "node:http"

const port = Number(process.env.NOTIFICATION_MOCK_PORT ?? 4566)
const host = process.env.NOTIFICATION_MOCK_HOST ?? "127.0.0.1"
const messages = []
let counter = 0

function sendJson(response, status, body) {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json",
  })
  response.end(JSON.stringify(body))
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = ""
    request.setEncoding("utf8")
    request.on("data", (chunk) => {
      body += chunk
    })
    request.on("end", () => resolve(body))
    request.on("error", reject)
  })
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`)

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {})
    return
  }

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { ok: true, count: messages.length })
    return
  }

  if (request.method === "GET" && url.pathname === "/messages") {
    sendJson(response, 200, { data: messages })
    return
  }

  if (request.method === "DELETE" && url.pathname === "/messages") {
    messages.length = 0
    counter = 0
    sendJson(response, 200, { ok: true })
    return
  }

  if (request.method === "POST" && (url.pathname === "/messages" || url.pathname === "/send")) {
    try {
      const body = await readBody(request)
      const parsed = body.length > 0 ? JSON.parse(body) : {}
      counter += 1
      const id = `mock_notification_${counter}`
      const record = {
        id,
        capturedAt: new Date().toISOString(),
        requestPath: url.pathname,
        ...parsed,
      }
      messages.push(record)
      console.error(
        `[notification-mock] ${id} ${record.payload?.channel ?? "unknown"} -> ${
          record.payload?.to ?? "unknown"
        }`,
      )
      sendJson(response, 202, { id })
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) })
    }
    return
  }

  sendJson(response, 404, { error: "not_found" })
})

server.listen(port, host, () => {
  console.error(`Notification mock listening at http://${host}:${port}`)
  console.error(`Capture endpoint: http://${host}:${port}/messages`)
})

process.on("SIGINT", () => server.close(() => process.exit(0)))
process.on("SIGTERM", () => server.close(() => process.exit(0)))
