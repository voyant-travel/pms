export function getOperatorStartEnv(context: unknown): CloudflareBindings | undefined {
  if (typeof context !== "object" || context === null || !("env" in context)) {
    return undefined
  }
  return (context as { env?: CloudflareBindings }).env
}
