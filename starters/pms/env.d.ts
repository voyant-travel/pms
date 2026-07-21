interface CloudflareBindings {
  /**
   * Per-request metrics dataset (Workers Analytics Engine). Optional —
   * the metrics middleware is a no-op without it.
   */
  METRICS?: AnalyticsEngineDataset

  // KV namespaces
  RATE_LIMIT: KVNamespace
  CACHE: KVNamespace

  // R2 (public media storage)
  MEDIA_BUCKET: R2Bucket
  // R2 (private document storage)
  DOCUMENTS_BUCKET: R2Bucket

  // Secrets
  INTERNAL_API_KEY: string
  SESSION_CLAIMS_SECRET: string
  BETTER_AUTH_SECRET: string
  DATABASE_URL: string
  /**
   * Optional comma-separated connection strings of same-region Neon read
   * replicas, used by the DEFAULT (neon-http) data plane only — reads
   * round-robin across replicas while writes (and `db.$primary`) go to the
   * primary. The transactional WebSocket client always talks to the primary
   * and is unaffected.
   *
   * Read-your-writes caveat: Neon replicas are eventually consistent
   * (typically milliseconds of lag), so a request that writes and then
   * reads the same data via the http client may read a slightly stale
   * replica. Surfaces that need strict read-your-writes should read via
   * `db.$primary` or live on the transactional client.
   *
   * Entries are trimmed; empty entries and entries equal to DATABASE_URL
   * are ignored. Ignored entirely when DATABASE_URL points at localhost
   * (the local pg.Pool fallback has no replica support).
   */
  DATABASE_URL_REPLICAS?: string
  /**
   * Operational escape hatch for the split data plane: set to "1" to
   * serve EVERY request with the transaction-capable WebSocket client
   * (pre-Phase-1 behavior) — e.g. if a transactional surface was missed
   * in the per-path routing. Costs a connection handshake per request.
   */
  DB_FORCE_TRANSACTIONAL?: string

  // Admin auth mode. Localhost/self-hosted deployments use local Better Auth
  // flows. Voyant Cloud deployments use Cloud as the exclusive identity broker.
  VOYANT_ADMIN_AUTH_MODE?: "local" | "voyant-cloud"

  // Member RBAC enforcement (member-rbac-rfc, voyant#2085). On by default —
  // each staff member's assigned scope set is enforced across admin routes
  // (full-access members with scopes `*` are unaffected). Kill switch: set to
  // "0"/"false"/"off" to disable enforcement without a code change.
  VOYANT_RBAC_ENFORCE?: string
  VOYANT_CLOUD_ADMIN_AUTH_AUDIENCE?: string
  VOYANT_CLOUD_ADMIN_AUTH_CLIENT_TOKEN?: string
  VOYANT_CLOUD_ADMIN_AUTH_EXCHANGE_URL?: string
  VOYANT_CLOUD_ADMIN_AUTH_JWKS_URL?: string
  VOYANT_CLOUD_ADMIN_AUTH_REVALIDATE_URL?: string
  VOYANT_CLOUD_ADMIN_AUTH_START_URL?: string
  VOYANT_CLOUD_APP_ID?: string
  VOYANT_CLOUD_APP_SLUG?: string
  VOYANT_CLOUD_DEPLOYMENT_ID?: string
  VOYANT_CLOUD_ENVIRONMENT?: string
  VOYANT_OPERATOR_BROWSER_EVIDENCE?: string
  VOYANT_AUTH_LOG_SECRET_FALLBACKS?: string

  // Voyant API (canonical email/sms/verify/vault/connect provider)
  VOYANT_API_KEY: string
  /** Legacy alias for VOYANT_API_KEY. */
  VOYANT_CLOUD_API_KEY?: string
  VOYANT_CLOUD_API_URL?: string
  VOYANT_CLOUD_VAULT_SLUG?: string
  EMAIL_FROM: string
  EMAIL_REPLY_TO?: string

  // KMS provider selection
  KMS_PROVIDER: "gcp" | "aws" | "env" | "local" | "voyant-cloud"
  KMS_ENV_KEY?: string
  KMS_LOCAL_KEY?: string

  // AWS KMS (required when KMS_PROVIDER=aws)
  AWS_REGION?: string
  AWS_ACCESS_KEY_ID?: string
  AWS_SECRET_ACCESS_KEY?: string
  AWS_SESSION_TOKEN?: string
  AWS_KMS_ENDPOINT?: string
  AWS_KMS_PEOPLE_KEY_ID?: string
  AWS_KMS_INTEGRATIONS_KEY_ID?: string

  // GCP KMS (required when KMS_PROVIDER=gcp)
  GCP_PROJECT_ID?: string
  GCP_KMS_KEYRING?: string
  GCP_KMS_LOCATION?: string
  GCP_KMS_PEOPLE_KEY_NAME?: string
  GCP_KMS_INTEGRATIONS_KEY_NAME?: string
  GCP_SERVICE_ACCOUNT_EMAIL?: string
  GCP_PRIVATE_KEY?: string

  /**
   * Storefront single-property mode. When set to an accommodation
   * property id, the `(storefront)` landing (`/shop`) redirects straight
   * to that property's detail page and the portfolio search is hidden —
   * a property manager pointing their own domain at one hotel. Leave
   * unset for multi-property mode (portfolio landing + search).
   */
  STOREFRONT_SINGLE_PROPERTY_ID?: string

  // App URLs
  APP_URL: string
  API_BASE_URL: string
  /**
   * Customer-facing site that hosts `/pay/:sessionId` links. Defaults to
   * DASH_BASE_URL/APP_URL when omitted, preserving single-worker deployments.
   */
  PUBLIC_CHECKOUT_BASE_URL?: string
  CORS_ALLOWLIST: string
  DASH_BASE_URL: string
  /**
   * Public base URL Cloudflare Browser Rendering uses to fetch any
   * external resources referenced from contract / invoice / document
   * templates (logos, signatures, fonts, etc.). Must be reachable from
   * the public internet — `localhost` or private hostnames will break
   * PDF generation because CF's headless browser can't resolve them.
   *
   * Production: set to a public URL (e.g. `https://api-1.example.io`)
   * pointing at this operator deployment. Variables resolver injects
   * it as `documents.base_url` for Liquid templates.
   *
   * Dev: leave unset. Templates that reference public assets (real
   * logos hosted on a CDN, etc.) will work; templates that try to
   * pull from `${documents.base_url}/...` will render with broken
   * resources, but the PDF still generates from the inline HTML so
   * local development isn't blocked.
   */
  DOCUMENTS_BASE_URL?: string

  // Netopia (pay-by-link card processor). `NETOPIA_MODE` selects sandbox
  // vs live (defaults to sandbox); `NETOPIA_URL` is an optional override
  // for staging proxies / test mocks. `NETOPIA_NOTIFY_URL` must be
  // publicly reachable so the processor can deliver callbacks.
  NETOPIA_MODE?: "sandbox" | "live"
  NETOPIA_URL?: string
  NETOPIA_API_KEY?: string
  NETOPIA_POS_SIGNATURE?: string
  /**
   * Server-to-server webhook receiver. Genuinely deploy-wide — Netopia
   * POSTs payment results here, so it must be a single publicly reachable
   * HTTPS endpoint. Should resolve to
   * `${API_BASE_URL}/v1/admin/finance/providers/netopia/callback`.
   */
  NETOPIA_NOTIFY_URL?: string
  /**
   * Default browser redirect after the customer completes (or cancels)
   * payment on Netopia's hosted page. Per-session overrides are passed via
   * `useCollectPayment({ returnUrl, cancelUrl })`; storefront flows
   * typically override per call, while operator-initiated send-link flows
   * leave the default pointing at the public `/pay/:sessionId` landing.
   */
  NETOPIA_REDIRECT_URL?: string
  /**
   * Deploy-wide fallback for the Netopia hosted-page language. The actual
   * language for each session is set per-call via `startProvider.payload.
   * language` (see `useCollectPayment`'s `payerLanguage` option), so this
   * env var only matters when the caller doesn't supply one.
   */
  NETOPIA_LANGUAGE?: string
  /**
   * Local development only: routes card-payment starts to the built-in mock
   * provider and enables `/v1/local/mock-card/:sessionId/approve`.
   */
  MOCK_CARD_PAYMENTS?: string

  // SmartBill (Romanian e-invoicing). When configured, invoice.issued and
  // invoice.proforma.issued events sync to SmartBill and store an external ref.
  SMARTBILL_USERNAME?: string
  /** Preferred token name. SMARTBILL_TOKEN is also supported for Protravel compatibility. */
  SMARTBILL_API_TOKEN?: string
  SMARTBILL_TOKEN?: string
  SMARTBILL_COMPANY_VAT_CODE?: string
  /** Default series for both invoices and proformas unless overridden below. */
  SMARTBILL_SERIES_NAME?: string
  SMARTBILL_INVOICE_SERIES_NAME?: string
  SMARTBILL_PROFORMA_SERIES_NAME?: string
  SMARTBILL_API_URL?: string
  SMARTBILL_LANGUAGE?: string
  SMARTBILL_ART_311_SPECIAL_REGIME?: string

  // Voyant Connect source adapter. Uses VOYANT_API_KEY for authentication.
  VOYANT_CONNECT_API_URL?: string
  VOYANT_CONNECT_OPERATOR_ID?: string
  VOYANT_CONNECT_MARKET?: string
  VOYANT_CONNECT_SYNC_LIMIT?: string
  /** Legacy alias for VOYANT_API_KEY. */
  VOYANT_CONNECT_API_KEY?: string

  // Manual bank-transfer block rendered on the public payment landing page.
  // Leave BENEFICIARY + IBAN empty to hide the bank-transfer tab. Currency
  // is intentionally omitted — it always tracks the booking's invoice
  // currency (set on the invoice at collection time). NOTES is deploy-wide
  // boilerplate; per-call notes from `initiateCheckoutCollection({ notes })`
  // override it.
  BANK_TRANSFER_BENEFICIARY?: string
  BANK_TRANSFER_IBAN?: string
  BANK_TRANSFER_BANK_NAME?: string
  BANK_TRANSFER_NOTES?: string

  // Channel connectivity (PLAN §4.7, Phase 6). Shared secret the public channel
  // webhook (`POST /v1/public/pms/channels/:channel/webhook`) requires in the
  // `x-channel-secret` header — the endpoint is anonymous by construction, so it
  // fails closed when this is unset. Set via `wrangler secret put
  // CHANNEL_WEBHOOK_SECRET`.
  CHANNEL_WEBHOOK_SECRET?: string
}
