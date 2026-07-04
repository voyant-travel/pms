import { createAuthenticatedR2DocumentDownloadResolver } from "@voyant-travel/hono/document-download"
import type { StorageProvider } from "@voyant-travel/storage"
import { createR2Provider } from "@voyant-travel/storage/providers/r2"

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
  zip: "application/zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

/** Best-effort MIME type guess from a file key/path. Used by the /v1/admin/media/* serve route. */
export function guessMimeType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? ""
  return MIME_BY_EXT[ext] ?? "application/octet-stream"
}

function createR2BucketStorage(
  bucket: R2Bucket | undefined,
  options: {
    publicBaseUrl?: string
  } = {},
): StorageProvider | null {
  if (!bucket) return null

  return createR2Provider({
    bucket,
    ...(options.publicBaseUrl ? { publicBaseUrl: options.publicBaseUrl } : {}),
  })
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

/**
 * Resolve the media storage provider from the environment.
 *
 * This is the single place to swap storage backends. The default uses
 * **Cloudflare R2 via the Workers binding** (`MEDIA_BUCKET`) — the native,
 * zero-signing path. Alternatives:
 *
 *   - **R2 via S3 API** (if you need cross-cloud parity or signed URLs):
 *     ```ts
 *     import { createS3Provider } from "@voyant-travel/storage/providers/s3"
 *     return createS3Provider({
 *       accessKeyId: env.R2_ACCESS_KEY_ID!,
 *       secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
 *       region: "auto",
 *       bucket: env.R2_BUCKET!,
 *       endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
 *     })
 *     ```
 *
 *   - **AWS S3 / S3-compatible** (Wasabi, MinIO, Backblaze B2, Spaces, etc.):
 *     ```ts
 *     return createS3Provider({
 *       accessKeyId: env.S3_ACCESS_KEY_ID!,
 *       secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
 *       region: env.S3_REGION ?? "us-east-1",
 *       bucket: env.S3_BUCKET!,
 *       endpoint: env.S3_ENDPOINT, // optional, for S3-compatible services
 *       publicBaseUrl: `${appUrl}/api/v1/admin/media/`,
 *     })
 *     ```
 *
 *   - **Local in-memory** (dev/tests only):
 *     ```ts
 *     import { createLocalStorageProvider } from "@voyant-travel/storage/providers/local"
 *     return createLocalStorageProvider({ baseUrl: `${appUrl}/api/v1/admin/media/` })
 *     ```
 *
 *   - **Custom** (GCS, Azure Blob, etc.): Implement the `StorageProvider`
 *     interface (upload/delete/signedUrl/get) and return it here.
 *
 * Returns `null` when no storage is configured — the upload/serve routes
 * will respond with 503.
 */
export function createMediaStorage(env: CloudflareBindings): StorageProvider | null {
  const appUrl = env.APP_URL?.replace(/\/api$/, "") ?? ""
  return createR2BucketStorage(env.MEDIA_BUCKET, {
    publicBaseUrl: `${appUrl}/api/v1/admin/media/`,
  })
}

/**
 * Resolve the private document storage provider from the environment.
 *
 * Documents default to a private R2 bucket binding (`DOCUMENTS_BUCKET`) with
 * no public base URL. Consumers should access files through fresh signed URLs
 * or authenticated application routes, not stable public URLs.
 *
 * Returns `null` when no private document storage is configured.
 */
export function createDocumentStorage(env: CloudflareBindings): StorageProvider | null {
  return createR2BucketStorage(env.DOCUMENTS_BUCKET)
}

export async function readDocumentContentBase64(
  env: CloudflareBindings,
  storageKey: string,
): Promise<string | null> {
  const object = await env.DOCUMENTS_BUCKET?.get(storageKey)
  if (!object) return null
  return arrayBufferToBase64(await object.arrayBuffer())
}

export async function resolveDocumentDownloadUrl(
  env: CloudflareBindings,
  storageKey: string,
  _expiresIn?: number,
): Promise<string | null> {
  return authenticatedDocumentDownloadResolver(env, storageKey)
}

const authenticatedDocumentDownloadResolver =
  createAuthenticatedR2DocumentDownloadResolver<CloudflareBindings>({
    apiBaseUrl: (env) =>
      env.APP_URL?.trim() || env.API_BASE_URL?.trim() || env.DOCUMENTS_BASE_URL?.trim() || null,
    routePrefix: "/v1/admin/documents/files",
    bucketBindingName: "DOCUMENTS_BUCKET",
  })
