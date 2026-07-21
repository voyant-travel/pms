import { createVoyantWorkerRuntimeHostPrimitives } from "@voyant-travel/framework/worker-job-host"
import { httpDbFromEnvForApp, withDbFromEnv } from "../lib/db"
import {
  createDocumentStorage,
  createMediaStorage,
  readDocumentContentBase64,
  resolveDocumentDownloadUrl,
} from "../lib/storage"

type OperatorEventDelivery = (
  event: unknown,
  bindings: CloudflareBindings,
) => Promise<unknown>

let graphEventDelivery: OperatorEventDelivery | undefined

export function bindOperatorGraphEventDelivery(delivery: OperatorEventDelivery): void {
  if (graphEventDelivery && graphEventDelivery !== delivery) {
    throw new Error("The operator graph event delivery port is already bound.")
  }
  graphEventDelivery = delivery
}

export async function deliverOperatorGraphEvent(
  event: unknown,
  bindings: CloudflareBindings,
): Promise<unknown> {
  if (!graphEventDelivery) {
    throw new Error("The operator graph event delivery port is not bound.")
  }
  return graphEventDelivery(event, bindings)
}

export function createOperatorWorkerRuntimeHostPrimitives(
  bindings: CloudflareBindings,
  deliverEvent: OperatorEventDelivery,
) {
  return createVoyantWorkerRuntimeHostPrimitives({
    bindings,
    resolveDatabase: (env) => {
      const resolved = httpDbFromEnvForApp(env)
      return "db" in resolved ? resolved.db : resolved
    },
    transaction: (env, operation) =>
      withDbFromEnv(env, (db) => db.transaction((tx) => operation(tx))),
    resolveStorage: (env, name) =>
      name === "documents" ? createDocumentStorage(env) : createMediaStorage(env),
    readStorage: readDocumentContentBase64,
    resolveDownloadUrl: resolveDocumentDownloadUrl,
    deliverEvent,
    readConfig: (env, key) => Reflect.get(env, key),
  })
}
