# @repo/typescript-config

Internal, shared `tsconfig` bases for the PMS monorepo. Carried over from the
`create-turbo` scaffold. The `@voyant-travel/pms-*` domain packages extend
`./base.json`.

## Configs

| File | For |
| --- | --- |
| `base.json` | base compiler options: `strict`, `NodeNext` module/resolution, `ES2022` target/lib (+ DOM), `declaration` + `declarationMap`, `isolatedModules`, `noUncheckedIndexedAccess`, `skipLibCheck` |
| `react-library.json` | base + React JSX for React libraries |
| `nextjs.json` | base tuned for Next.js apps |

## Extending

```jsonc
// tsconfig.json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src"]
}
```

## License

MIT.
