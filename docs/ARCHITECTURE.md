# Arquitectura de bukcraw

Este documento describe la arquitectura interna de **bukcraw**, un scraper de Goodreads que extrae libros desde blogs, busca ediciones según idioma/formato y genera reportes cruzados para optimizar retos de lectura.

## Visión general

El proyecto es una **CLI de Bun** cuyo binario (`src/cli.ts`) actúa como un *dispatcher*: no contiene lógica de negocio, solo reenvía cada subcomando a un script independiente dentro de `scripts/`. Ese diseño separa el parseo de argumentos (`cac`, en `src/cli.ts`) de la ejecución real (los scripts).

```
┬ src/cli.ts                 → parseo de comandos (cac) → spawn de scripts/
├ scripts/cli/*.ts           → entradas de ejecución (pipeline, report, set-cover, workflow)
├ src/services/*.ts          → dominio: scrapers + parsers + orquestador
├ src/core/*.ts              → infraestructura (DB, HTTP, browser, cache, rate-limiter)
├ src/config/constants.ts    → todas las constantes de timing/TTL/URLs
├ src/types/*.ts             → tipos de dominio + schema de Goodreads (Apollo)
└ src/utils/*.ts             → helpers (logger, reporter, concurrencia)
```

## Flujo de datos del pipeline: `Blog → Book → Edition`

El flujo principal está orquestado por `PipelineService.processBlog()` (`src/services/pipeline-service.ts`) e impulsado por `scripts/cli/pipeline.ts`. Se ejecuta el mismo ciclo por cada `blogId`:

1. **Scrapear blog** (`BlogService.scrapeBlog`) → HTML del post → `parseBlogHtml` extrae la lista de libros mencionados (con su `section`, título y portada).
2. **Por cada libro mencionado**:
   - **Scrapear detalles** (`BookService.scrapeBook`) → extrae el `legacyId` (Work ID) del objeto `__NEXT_DATA__`.
   - **Obtener filtros válidos** (`EditionService.scrapeEditionsFilters`) → de la página de ediciones se leen los `<select>` (`sort`, `filter_by_format`, `filter_by_language`) para validar opciones.
   - **Pre-chequeo** (si no `--force`): si el idioma pedido no existe o ningún formato esperado está disponible, el libro se marca `skipped` y se salta sin descargar ediciones.
   - **Modo `check`** (`--check-only`): si supera el pre-chequeo, el libro cuenta como `done` y **no** se descargan ediciones — sirve para verificar disponibilidad sin gastar requests.
   - **Scrapear ediciones** (`EditionService.scrapeFilteredEditions`): por cada formato se construye la URL con `?sort&filter_by_format&filter_by_language` y se recorren todas las páginas de paginación (`&page=N`) con concurrencia limitada (3) vía `pMap`.
3. **Reporte combinado** (solo `run --report`): `PipelineService.generateReport` cruza `book_books` + `blogs` con `books` y `editions` de la DB, deduplica por clave canónica `title-author` y escribe el JSON en `.reports/`.

### El pre-chequeo de disponibilidad
Para ahorrar requests, antes de bajar ediciones se valida contra los filtros reales del libro:
- si el idioma esperado no está, se descarta (reason `Language '<lang>' not found`);
- si ningún formato esperado está, se descarta (`Format(s) '<formats>' not found`).

`--force` salta esta validación y siempre scrapea.

## Capa de servicios (`src/services`)

Los servicios se dividen en **scrapers de dominio** y **orquestador**.

### `GoodreadsService` (facade)
`src/services/goodreads-service.ts`. Expone tres sub-servicios y los delega:
- `service.blog` → `BlogService`
- `service.book` → `BookService`
- `service.edition` → `EditionService`

También agrega telemetría (`printTelemetry`) que suma el cache hit de cada scraper: `httpSuccess`, `browserFallback`, `notModified`, `cacheHits`.

### `BaseScraperService` (base abstracta)
`src/services/base-scraper.ts`. Del que extienden los tres scrapers. Cada instancia crea su propio `CacheManager`, `DatabaseService` y `RateLimiter`. Maneja:
- **Sesión (cookies)**: reutiliza una sesión de la DB si es fresca (`SESSION_TTL_MINUTES`), si no la adquiere con Puppeteer (`acquireSessionCookies`). La adquisición resiste bloqueos/redirects con reintentos y `backoff`.
- `fetchContentWithFallback(url, validate?)`: intenta **HTTP primero** y cae a **Puppeteer** si el contenido falla la validación o aparece bloqueado.
- **conditional GET**: envía `If-None-Match` / `If-Modified-Since` desde la tabla `http_metadata`; si responde `304`, reusa la copia en cache (`method: "not-modified"`).
- **WAF / captcha**: detecta el challenge `HTTP 202` de AWS WAF y espera el reload automático; rechaza redirecciones a `/user/sign_in` o `captcha`.
- **Rate limiting**: cada request pasa por `RateLimiter.throttle()`.

### Scrapers de dominio
Cada scraper extiende `BaseScraperService` y delega el parseo a una función pura:

| Scraper | Parser | HTML de entrada | Objetivo |
|---|---|---|---|
| `BlogService` | `blog-parser` | blog show | mencionados (tooltip containers → fallback en enlaces sueltos) |
| `BookService` | `book-parser` | `__NEXT_DATA__` (Next.js) | `Book` con `legacyId` |
| `EditionService` | `editions-parser` | work editions | `Edition[]`, filtros y paginación |

Los parsers sintetizan con `linkedom` (DOM puro sin browser) y son **funciones puras**: reciben `string` de HTML/JSON y devuelven objetos tipados; **no hacen I/O**.

### `PipelineService` (orquestador)
`src/services/pipeline-service.ts`. Sin estado persistente; recibe los tres servicios + `DatabaseService` y un `reporter`. `processBlog` implementa el ciclo de un blog y `generateReport` produce el JSON final.

## Capa core (`src/core/`)

### `DatabaseService` (`database.ts`) y repositorios
Una única capa SQLite (`library.sqlite` en la raíz) con `bun:sqlite` y `PRAGMA journal_mode=WAL`, `foreign_keys=ON`. `DatabaseService` es una **fachada de compatibilidad** que expone los cinco repositorios tipados:

- `BookRepository` — CRUD de `books` (cache de página con `updated_at`, `CACHE_TTL_DAYS`).
- `BlogRepository` — `blogs` + tabla intermedia `blog_books` (relación N:M).
- `EditionRepository` — insert/select/delete de `editions` por `book_legacy_id` y opcional `language`.
- `SessionRepository` — una sesión (cookies) por vez.
- `MetadataRepository` — `ETag`/`Last-Modified` por `url_hash` para conditional GET.

Esquema de tablas: `schema_version`, `sessions`, `books`, `blogs`, `blog_books`, `editions`, `http_metadata`.

### `HttpClient` (`http-client.ts`)
Cliente `fetch` con headers "de navegador", `get()` con retry basado en `RETRYABLE_STATUS_CODES` (429, 5xx) + jitter, y `conditionalGet()` para revalidación. `isBlocked(html)` detecta captcha/robot.

### `CacheManager` (`cache-manager.ts`)
Cache **en archivos** bajo `./cache/YYYY-MM-DD/[books|blog|authors|misc]/HASH.<ext>`:
- `.html` y `.html.gz` (gzip) para páginas crudas;
- `-parsed.json`, `.json`, `-editions.json`, `-filter-meta.json` para datos derivados.
Un cache **LRU en memoria** de 5 min (200 entradas) y auto-purga directorios más viejos que `FILE_CACHE_LOOKBACK_DAYS`. `getOrFetch` compone get + save.

### `BrowserClient` (browser-client.ts)
Singleton de Puppeteer: un solo browser por corrida, una página por uso (configuradas con anti-detección: `webdriver=false`, `userAgentMetadata`) y bloquea `image`, `stylesheet`, `font`, `media`, `other` para acelerar.

### `RateLimiter` (`rate-limiter.ts`)
`throttle()` espera un mínimo de `SCRAPING_DELAY_BASE_MS` (+ jitter aleatorio) entre requests.

## Configuración (`src/config/constants.ts`)
Ahí viven todas las constantes: URLs (BOOK/BLOG/WORK_URL), user-agent y client-hints, timings (TTL, delays, navegación), retries y timeouts de captcha WAF. Se cambian aquí, nunca inline en el código.

## Utils (`src/utils/`)
- `logger.ts` — Logger con niveles + sink (para la grilla) y helpers ANSI.
- `reporter.ts` — contrato `PipelineReporter` + `NULL_REPORTER`.
- `grid-reporter.ts` / `plain-reporter.ts` — implementaciones de `PipelineReporter`: una TUI animada, la otra texto plano con progreso.
- `progress.ts`, `concurrency.ts` (`pMap`), `util.ts` (`delay`, `hashUrl`, `isValidBookId` …).

## CLI (`src/cli.ts`)
Parseo con `cac`. Cada subcomando reenvía a un script:

| Comando                        | Script destino |
|--------------------------------|----------------|
| `run [...blogs]`               | `scripts/cli/pipeline.ts` |
| `check [...blogs]`             | `scripts/cli/pipeline.ts --check-only` |
| `report`                       | `scripts/cli/report-books-relations.ts` |
| `set-cover`                    | `scripts/cli/set-cover-books.ts` |
| `workflow <blogId>`            | `scripts/cli/workflow-blog-to-editions.ts` |
| `cache:clear`                  | `scripts/cache/clear.ts` |
| `db:reset` / `db:delete-book` / `db:delete-blog` | `scripts/db/*.ts` |

`run` y `check` comparten el mismo script; la diferencia es el flag `--check-only`.

## Convenciones clave
- **Parsers puros**: (`*-parser.ts`) funciones que solo reciben `string` y devuelven objetos tipados. Sin I/O.
- **Servicios con estado propio**: cada scraper instancia su propio `DatabaseService` y `CacheManager` dentro de `BaseScraperService`; el pipeline crea un `DatabaseService` para el reporte.
- **IDs de Goodreads**: en `blog`/`book` los IDs son `"12345-title-slug"` (moderno) y en ediciones se usa `legacyId` (numérico). Las *ediciones* dependen del `legacyId` de la URL `WORK_URL`.
- **Clave canónica `title-author`**: deduplicación de libros a partir de `title`+`author`, en minúsculas y sin caracteres no alfanuméricos. En el script legado (`report-books-relations`) se normalizan además los acentos (NFD).
- **Cache multi-nivel**: DB cache (con TTL) → archivo `__NEXT_DATA__`/parsed → memoria → red → fallback browser.
- **Nunca guardar sesión envenenada**: se rechazan respuestas 403/429, redirecciones a login/captcha o ausencia de cookies.

## Consideraciones
- El runtime es **Bun** (`bun:sqlite`, `Bun.file`, `Bun.write`, `bun test`).
- Formato y lint con **Biome** (`bun run check`).
- `index.ts` es un ejemplo/demo de scraping directo (blog fijo), no es la CLI.