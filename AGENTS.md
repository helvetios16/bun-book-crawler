# Rules

Este archivo contiene convenciones y preferencias para los agentes de IA que trabajen en este repositorio. Solo realizar lo que se indica no hacer mas halla de lo solicitado.

Se utiliza biome para el formateo y linting del codigo.
Se utiliza bun para el empaquetado y ejecucion del codigo.
Se utiliza ';' para la ejecucion en la terminal. No se usa '&&'.

## Estructura de Commit

Cuando se solicite un commit, se debe seguir estrictamente la siguiente estructura y realizarlo en español:

```text
 <tipo>(<alcance>): <resumen corto>

    - <Detalle del cambio 1>
    - <Detalle del cambio 2>
    - <Detalle del cambio 3>
    - <Detalle del cambio ...>
```

# Reglas de Revisión de Código

## TypeScript

- **No usar tipos `any`**: utilizar un tipado adecuado.
- **Evitar `unknown`**: a menos que se valide con guardas de tipo (*type guards*).
- **No usar `@ts-ignore`**.
- **Usar `@ts-expect-error`**: solo acompañado de un comentario explicativo.
- **Habilitar `strict: true`**: en el archivo `tsconfig.json`.

- **Usar `const` sobre `let`**: siempre que sea posible.
- **Tipar explícitamente los parámetros de función**.
- **Tipar explícitamente los valores de retorno**: para APIs públicas.
- **Confiar en la inferencia de tipos**: para funciones internas cuando el tipo sea claro.

- **Preferir interfaces sobre *type aliases***: para definir la forma de los objetos.
- **Usar *type aliases***: para uniones y tipos de utilidad.
- **Centralizar tipos compartidos**: para evitar la duplicación.

- **Usar parámetros de objeto**: para funciones con 4 o más parámetros.
- **Evitar el encadenamiento opcional (*optional chaining*)**: en lógica de negocio crítica sin validación previa.

- **Preferir `as const`**: para patrones similares a enumeraciones (*enums*).
- **Usar `Record<K, V>`**: en lugar de firmas de índice (*index signatures*).
- **Marcar datos inmutables con `readonly`**.
