# Rules

Este archivo contiene convenciones y preferencias para los agentes de IA que trabajen en este repositorio. Solo realizar lo que se indica no hacer mas halla de lo solicitado.

## Estructura de Commit

Cuando se solicite un commit, se debe seguir estrictamente la siguiente estructura y realizarlo en español:

```text
 <tipo>(<alcance>): <resumen corto>

    - <Detalle del cambio 1>
    - <Detalle del cambio 2>
    - <Detalle del cambio 3>
    - <Detalle del cambio ...>
```

# Code Review Rules

## TypeScript

- No `any` types - use proper typing
- Avoid `unknown` unless validated with type guards
- Do not use `@ts-ignore`
- Use `@ts-expect-error` only with explanatory comment
- Enable `strict: true` in `tsconfig.json`

- Use `const` over `let` when possible
- Explicitly type function parameters
- Explicitly type function return values for public APIs
- Rely on type inference for internal functions when clear

- Prefer interfaces over type aliases for object shapes
- Use type aliases for unions and utility types
- Centralize shared types to avoid duplication

- Use object parameters for functions with 4+ parameters
- Avoid optional chaining on critical business logic without validation

- Prefer `as const` for enums-like patterns
- Use `Record<K, V>` instead of index signatures
- Mark immutable data with `readonly`
