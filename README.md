# bukcraw

Scraper de Goodreads que extrae libros desde blogs, busca ediciones en español y genera reportes cruzados para optimizar retos de lectura.

## Instalacion

```bash
bun install
```

## CLI

El binario principal es `bukcraw`. Todos los comandos se ejecutan con:

```bash
bun run src/cli.ts <comando> [opciones]
```

---

## Comandos

### `run` — Pipeline completo

Scrapea uno o varios blogs, extrae libros y ediciones, y opcionalmente genera un reporte combinado.

```bash
bun run src/cli.ts run <blogId1> [blogId2...] [opciones]
```

| Flag | Default | Descripcion |
|---|---|---|
| `--blogs=<id1,id2,...>` | — | Blog IDs separados por coma (alternativa a args posicionales) |
| `--language=<code>` | `spa` | Codigo de idioma (`spa`, `eng`, `por`, `ita`, `fra`, `deu`) |
| `--format=<fmt>` | `ebook,Kindle Edition` | Formatos separados por coma |
| `--sort=<order>` | `num_ratings` | Orden de ediciones (`num_ratings`, `avg_rating`, `publish_date`) |
| `--report` | — | Genera el reporte JSON al finalizar (desactivado por defecto) |
| `--force` | — | Fuerza scraping completo ignorando validaciones de formato |
| `--plain` | — | Desactiva la grilla animada y usa logs de texto plano |
| `--output=<path>` | auto-generado | Nombre del archivo de salida |
| `--help`, `-h` | — | Muestra ayuda |

#### Ejemplos

```bash
# Dos blogs con defaults (español, ebook + Kindle)
bun run src/cli.ts run 3046-8-new-books-recommended 2941-best-romance-2026

# Tres blogs, solo ebooks en ingles, con reporte
bun run src/cli.ts run --blogs=blog-1,blog-2,blog-3 --language=eng --format=ebook --report

# Con nombre de salida personalizado
bun run src/cli.ts run blog-1 blog-2 --report --output=reto-mayo-2026.json

# Forzar rescraping sin grilla
bun run src/cli.ts run blog-1 --force --plain
```

#### Que hace

1. **Phase 1 — Scraping**: Para cada blog, extrae los libros mencionados, scrapea detalles y busca ediciones con los filtros dados.
2. **Phase 2 — Reporte** *(solo con `--report`)*: Cruza los datos en la base de datos, deduplica libros por titulo+autor, y genera un JSON con las relaciones.
3. **Output**: Muestra un resumen en pantalla; el JSON se guarda en `.reports/` si `--report` esta activo.

---

### `check` — Verificacion rapida

Verifica disponibilidad de ediciones sin scrapear datos completos. Util para detectar si un blog ya tiene resultados en la base de datos.

```bash
bun run src/cli.ts check <blogId1> [blogId2...] [opciones]
```

Acepta `--language`, `--format` y `--plain`.

---

### `report` — Reporte desde la DB

Genera el reporte de relaciones cruzadas usando los datos ya existentes en la base de datos, sin hacer scraping.

```bash
bun run src/cli.ts report [opciones]
```

| Flag | Descripcion |
|---|---|
| `--language=<code>` | Filtrar ediciones por idioma |
| `--blogs=<ids>` | IDs de blogs separados por coma |
| `--sort=<type>` | Orden del picker de blogs (`date`, `name`, `id`) |
| `--output=<path>` | Nombre del archivo de salida |

---

### `set-cover` — Optimizacion de lectura

Calcula que libros leer para cubrir todos los retos de lectura seleccionados con la menor cantidad de paginas posible.

```bash
bun run src/cli.ts set-cover [opciones]
```

| Flag | Default | Descripcion |
|---|---|---|
| `--language=<code>` | `spa` | Codigo de idioma |
| `--format=<fmt>` | `ebook,Kindle Edition` | Formatos separados por coma |
| `--blogs=<ids>` | — | IDs de blogs separados por coma |
| `--sort=<type>` | `date` | Orden del picker de blogs (`date`, `name`, `id`) |
| `--algorithm=<algo>` | `greedy` | Algoritmo: `greedy` (rapido, aproximado) o `exact` (DP optimo, max 20 blogs) |
| `--output=<path>` | — | Nombre del archivo de salida |

Abre `set-cover.html` en el navegador para visualizar los resultados de forma interactiva.

---

### `workflow` — Flujo por un solo blog (legacy)

Ejecuta el flujo Blog → Libros → Ediciones para un único blog y guarda un reporte por blog (sin reporte combinado). Es el antecesor del comando `run`.

```bash
bun run src/cli.ts workflow <blogId> [opciones]
```

| Flag | Default | Descripcion |
|---|---|---|
| `--language=<code>` | `spa` | Codigo de idioma |
| `--format=<fmt>` | `ebook,Kindle Edition` | Formatos separados por coma (`hardcover`, `paperback`, `ebook`, `Kindle Edition`, `audiobook`) |
| `--sort=<order>` | `num_ratings` | Orden de las ediciones |

El reporte se guarda como `.reports/report-<blogId>-<language>.json`.

---

### `cache:clear` — Limpiar cache

```bash
bun run src/cli.ts cache:clear
```

---

### Gestion de base de datos

```bash
# Borra todo el contenido de la base de datos
bun run src/cli.ts db:reset [--force]

# Busca y borra libros junto a sus ediciones y referencias
bun run src/cli.ts db:delete-book [--force]

# Selecciona y borra blogs junto a sus libros exclusivos
bun run src/cli.ts db:delete-blog [--force]
```

`--force` omite la confirmacion interactiva en todos los comandos de borrado.

---

## Formato de salida (`run --report` / `report`)

```json
{
  "generatedAt": "2026-04-09T...",
  "count": 85,
  "blogs": [
    { "id": "blog-1", "title": "Best Romance 2026", "url": "..." }
  ],
  "books": [
    {
      "id": "12345-book-title",
      "title": "Book Title",
      "author": "Author Name",
      "blogs": [
        { "id": "blog-1", "title": "Best Romance 2026", "url": "..." },
        { "id": "blog-2", "title": "New Releases", "url": "..." }
      ],
      "editionsFound": [
        { "title": "Edicion Kindle", "language": "spa", "format": "Kindle Edition", "link": "..." }
      ]
    }
  ]
}
```

## Reportes visuales

- **`report.html`** — Abre en el navegador y arrastra un JSON de `.reports/` para ver los libros con portadas, ratings y filtros interactivos.
- **`set-cover.html`** — Visor interactivo para los resultados del comando `set-cover`.

Todos los reportes generados se guardan en `.reports/`.

## Scripts directos

Si necesitas ejecutar pasos por separado sin la CLI:

| Script | Descripcion |
|---|---|
| `bun run scripts/cli/pipeline.ts` | Pipeline completo Blog → Libros → Ediciones (backend del comando `run`) |
| `bun run scripts/cli/report-books-relations.ts` | Reporte de relaciones desde la DB (comando `report`) |
| `bun run scripts/cli/set-cover-books.ts` | Optimizacion de lectura (comando `set-cover`) |
| `bun run scripts/cli/workflow-blog-to-editions.ts --blogId=<id>` | Un solo blog con sus ediciones (legacy) |
| `bun run scripts/cli/create-session.ts` | Genera y guarda cookies de sesion manualmente |
| `bun run scripts/cache/clear.ts` | Borra el directorio `./cache` |
| `bun run scripts/cache/clean.ts` | Limpieza puntual del cache |
| `bun run scripts/db/export.ts --format=csv` | Exporta libros a CSV/JSON |
| `bun run scripts/db/query.ts` / `sql.ts` | Consultas SQL interactivas sobre `library.sqlite` |
| `bun run scripts/db/reset.ts` / `delete-book.ts` / `delete-blog.ts` | Borrado interactivo de datos |
| `bun run scripts/debug/*.ts` | Scripts one-off para depurar parsers y fetchers |

## Tests

```bash
bun test
```

## Lint / Format

```bash
bun run lint      # biome lint --write
bun run format    # biome format --write
bun run check     # biome check --write (lint + format)
```

## Tech stack

- **Runtime**: [Bun](https://bun.com)
- **Scraping**: Puppeteer + HTTP client hibrido con retry y rate-limiting
- **Parsing**: linkedom (DOM rapido sin browser)
- **DB**: SQLite (bun:sqlite)
- **Cache**: Archivos gzip por dia con auto-purge
