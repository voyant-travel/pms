import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { buildDeploymentGraphJson } from "@voyant-travel/framework/deployment-artifacts"
import { resolveProject, writeProjectArtifacts } from "@voyant-travel/framework/project"
import project from "../voyant.config.ts"

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const configPath = join(projectRoot, "voyant.config.ts")
const mode = process.argv.includes("--check") ? "check" : "write"

const resolved = await resolveProject({ project, projectRoot, configPath })
const artifacts = {
  ...resolved.artifacts,
  files: [
    ...resolved.artifacts.files,
    {
      path: "deployment-graph.generated.json",
      contents: buildDeploymentGraphJson(resolved.graph),
    },
  ].map((file) =>
    file.path === "runtime/project-runtime.generated.ts"
      ? { ...file, contents: orderEagerRuntimeContributors(file.contents) }
      : file,
  ),
}
const result = await writeProjectArtifacts({
  projectRoot,
  mode,
  artifacts,
})

for (const file of result.files) {
  console.log(`${file.status.padEnd(9)} ${file.path}`)
}

if (!result.ok) {
  process.exitCode = 1
}

function orderEagerRuntimeContributors(source) {
  const specifierMatch = source.match(
    /export const GENERATED_GRAPH_RUNTIME_CONTRIBUTOR_SPECIFIERS = \[\n([\s\S]*?)\n\] as const/,
  )
  const factoriesMatch = source.match(
    /const GENERATED_GRAPH_RUNTIME_CONTRIBUTORS: readonly VoyantGraphRuntimeContributor\[] = \[\n([\s\S]*?)\n\]/,
  )
  if (!specifierMatch || !factoriesMatch) return source

  const specifiers = [...specifierMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1])
  const orderedIndexes = specifiers.map((_, index) => index)
  removeContributor(
    orderedIndexes,
    specifiers,
    "@voyant-travel/cruises/runtime-contributor",
  )
  removeContributor(
    orderedIndexes,
    specifiers,
    "@voyant-travel/plugin-smartbill/runtime-contributor",
  )
  moveBefore(
    orderedIndexes,
    specifiers,
    "@voyant-travel/finance/runtime-contributor",
    "@voyant-travel/bookings/runtime-contributor",
  )
  moveBefore(
    orderedIndexes,
    specifiers,
    "@voyant-travel/quotes/runtime-contributor",
    "@voyant-travel/commerce/runtime-contributor",
  )
  const orderedFactories = orderedIndexes
    .map((index) => `  GENERATED_RUNTIME_CONTRIBUTOR_${index},`)
    .join("\n")

  return source.replace(factoriesMatch[0], `${factoriesMatch[0].split("[\n")[0]}[\n${orderedFactories}\n]`)
}

function moveBefore(indexes, specifiers, provider, consumer) {
  const providerIndex = specifiers.indexOf(provider)
  const consumerIndex = specifiers.indexOf(consumer)
  const providerPosition = indexes.indexOf(providerIndex)
  const consumerPosition = indexes.indexOf(consumerIndex)
  if (
    providerIndex === -1 ||
    consumerIndex === -1 ||
    providerPosition === -1 ||
    consumerPosition === -1 ||
    providerPosition < consumerPosition
  ) {
    return
  }
  indexes.splice(providerPosition, 1)
  indexes.splice(indexes.indexOf(consumerIndex), 0, providerIndex)
}

function removeContributor(indexes, specifiers, contributor) {
  const contributorIndex = specifiers.indexOf(contributor)
  const position = indexes.indexOf(contributorIndex)
  if (position !== -1) indexes.splice(position, 1)
}
