import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { resolveProject, writeProjectArtifacts } from "@voyant-travel/framework/project"

import project from "../voyant.config"

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const configPath = join(projectRoot, "voyant.config.ts")
const artifactRoot = join(projectRoot, ".voyant")
const resolved = await resolveProject({ project, projectRoot, configPath })
const result = await writeProjectArtifacts({
  projectRoot,
  artifacts: resolved.artifacts,
})

await mkdir(artifactRoot, { recursive: true })
await writeFile(
  join(artifactRoot, "deployment-graph.generated.json"),
  `${JSON.stringify(resolved.graph, null, 2)}\n`,
)

for (const file of result.files) {
  console.log(`voyant artifact ${file.status}: ${file.path}`)
}
console.log("voyant artifact written: deployment-graph.generated.json")
