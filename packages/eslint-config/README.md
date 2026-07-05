# @repo/eslint-config

Internal, private ESLint flat configs shared across the PMS monorepo. Carried
over from the `create-turbo` scaffold. Not published.

> Note: the `@voyant-travel/pms-*` domain packages lint with **Biome**
> (`biome check src/`, see the repo-root `biome.json`); these ESLint configs are
> retained for any package or app that opts into ESLint.

## Exports

| Subpath | Config |
| --- | --- |
| `./base` | base flat config: `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-config-prettier` + the `turbo/no-undeclared-env-vars` rule; all findings downgraded to warnings via `eslint-plugin-only-warn` |
| `./react-internal` | base + React (`eslint-plugin-react`, `eslint-plugin-react-hooks`) for internal React libraries |
| `./next-js` | base + `@next/eslint-plugin-next` for Next.js apps |

## Extending

```js
// eslint.config.js
import { config } from "@repo/eslint-config/base"

export default config
```

## License

Internal (private, unpublished).
