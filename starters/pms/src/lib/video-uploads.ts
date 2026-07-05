import type { CreateVideoUploadInput, VideoUploadTicket } from "@voyant-travel/cloud-sdk"
import { getCloudClient, type VoyantApiEnv } from "./voyant-cloud"

/**
 * Default video upload handler for this template.
 *
 * Returns a one-shot TUS upload ticket that the client uploads the video bytes
 * to directly. To switch providers (e.g., upload through your own Cloudflare
 * Stream account or any TUS-compatible host), replace the body of this function
 * with one that constructs the equivalent ticket.
 */
export function createVideoUploadTicket(
  env: VoyantApiEnv,
  input: CreateVideoUploadInput,
): Promise<VideoUploadTicket> {
  const client = getCloudClient(env)
  return client.video.videos.createUpload(input)
}
