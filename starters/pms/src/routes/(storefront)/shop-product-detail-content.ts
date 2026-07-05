/**
 * Per `catalog-sourced-content.md` §3.5.3, the content endpoints
 * return both the payload and locale-resolution metadata. The
 * detail page surfaces a small "served in <locale>" hint when the
 * fallback chain kicked in, and a "limited content available" hint
 * when the synthesizer (§3.6) produced the payload from the durable
 * sourced-entry projection rather than a real getContent fetch.
 */
export interface ContentResolution {
  /** Locale actually served — may differ from the user's preference. */
  served_locale?: string
  match_kind?: "exact" | "language_match" | "fallback_chain" | "any"
  /** Where the content came from. "synthesized" = thin fallback. */
  source?: "owned" | "sourced-cache" | "sourced-fresh" | "synthesized"
  served_stale?: boolean
  machine_translated?: boolean
}

/**
 * Server response shape per `catalog-sourced-content.md`. The
 * payload + resolution metadata may sit either at the top level or
 * nested under a `data` envelope (different routes wrap differently).
 */
interface ContentEnvelope<T> extends ContentResolution {
  content?: T
  /** Some routes flatten the payload directly into the envelope. */
  synthesized?: boolean
}

type ContentResponse<T> = ContentEnvelope<T> & {
  data?: ContentEnvelope<T>
}

/**
 * Build a BCP-47 preference chain from the browser. Sent as
 * `Accept-Language` so the public content endpoints can honor the
 * user's locale preference per §3.5.3.
 */
function getPreferredLocaleHeader(): string {
  if (typeof navigator === "undefined") return "en-GB"
  const langs = (navigator.languages?.length ? navigator.languages : [navigator.language]).filter(
    Boolean,
  )
  return langs.join(",")
}

export async function fetchContent<T>(
  url: string,
): Promise<{ content: T; resolution: ContentResolution } | null> {
  const res = await fetch(url, {
    credentials: "include",
    headers: {
      "accept-language": getPreferredLocaleHeader(),
    },
  })
  if (!res.ok) {
    if (res.status === 404) return null
    throw new Error(`Content request failed: ${res.status}`)
  }
  const json = (await res.json()) as ContentResponse<T>
  const envelope: ContentEnvelope<T> = json.data ?? json
  const content = envelope.content
  if (!content) return null
  return {
    content,
    resolution: {
      served_locale: envelope.served_locale,
      match_kind: envelope.match_kind,
      source: envelope.synthesized ? "synthesized" : envelope.source,
      served_stale: envelope.served_stale,
      machine_translated: envelope.machine_translated,
    },
  }
}
