import { Database } from "bun:sqlite";

/**
 * TUTORIAL DE SQLITE EN BUN
 * -------------------------
 * Este script demuestra cómo realizar consultas a tu base de datos 'library.sqlite'
 * existente, cubriendo desde lo básico hasta relaciones entre tablas.
 */

// 1. CONEXIÓN
// Abrimos la base de datos en modo lectura/escritura (por defecto)
// create: true crea el archivo si no existe (aunque aquí asumimos que ya tienes datos)
const db = new Database("library.sqlite", { create: true });

console.log("📂 Base de datos abierta exitosamente.\n");

try {
  // ---------------------------------------------------------
  // EJEMPLO 1: CONSULTA BÁSICA (SELECT)
  // ---------------------------------------------------------
  // .prepare() precompila la consulta para mejor rendimiento.
  // .all() ejecuta y devuelve un array con todos los resultados.
  console.log("--- 1. Consulta Básica (Top 3 Libros con mejor rating) ---");

  const queryBasic = db.query(`
    SELECT id, title, author, average_rating 
    FROM books 
    ORDER BY average_rating DESC 
    LIMIT 3
  `);

  const topBooks = queryBasic.all();
  console.table(topBooks);

  // ---------------------------------------------------------
  // EJEMPLO 2: PARÁMETROS SEGUROS (Evitar SQL Injection)
  // ---------------------------------------------------------
  // NUNCA concatenes strings así: "WHERE id = " + id (Es inseguro)
  // USA el prefijo $variable en la consulta y pasa un objeto en .get() o .all()
  console.log("\n--- 2. Consulta con Parámetros (Buscar un libro específico) ---");

  // Asumimos que queremos buscar el primer libro que obtuvimos arriba
  const targetId = topBooks[0]?.id || "1";

  const queryParam = db.query(`
    SELECT id, title, author 
    FROM books 
    WHERE id = $idInput
  `);

  // .get() devuelve solo el primer resultado (o null si no hay nada)
  const specificBook = queryParam.get({ $idInput: targetId });
  console.log("Libro encontrado:", specificBook);

  // ---------------------------------------------------------
  // EJEMPLO 3: RELACIONES (JOINs)
  // ---------------------------------------------------------
  // Cruzamos la tabla 'books' con 'editions' usando la clave foránea.
  // books.legacy_id  <-->  editions.book_legacy_id
  console.log("\n--- 3. Relaciones (Libros y sus Ediciones) ---");

  const queryJoin = db.query(`
    SELECT 
      b.title as Libro,
      e.title as Edicion,
      e.language as Idioma
    FROM books b
    INNER JOIN editions e ON b.legacy_id = e.book_legacy_id
    WHERE e.language = 'Spanish' -- Solo ediciones en español
    LIMIT 5
  `);

  const spanishEditions = queryJoin.all();

  if (spanishEditions.length > 0) {
    console.table(spanishEditions);
  } else {
    console.log("! No se encontraron ediciones en español para mostrar en el ejemplo.");
  }

  // ---------------------------------------------------------
  // EJEMPLO 4: AGREGACIONES (GROUP BY)
  // ---------------------------------------------------------
  // Contamos cuántas ediciones tiene cada libro
  console.log("\n--- 4. Agregación (Conteo de ediciones por libro) ---");

  const queryCount = db.query(`
    SELECT 
      b.title,
      COUNT(e.id) as total_ediciones
    FROM books b
    LEFT JOIN editions e ON b.legacy_id = e.book_legacy_id
    GROUP BY b.id
    ORDER BY total_ediciones DESC
    LIMIT 5
  `);

  const stats = queryCount.all();
  console.table(stats);
} catch (error) {
  console.error("❌ Error ejecutando consultas:", error);
} finally {
  // Es buena práctica cerrar la conexión, aunque Bun lo hace al terminar el proceso
  db.close();
  console.log("\n🔒 Base de datos cerrada.");
}
