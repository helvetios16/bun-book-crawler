import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";

/**
 * Script de prueba para validar la extracción contextual de libros de un blog.
 * Cumple con las reglas de AGENTS.md.
 */

interface BookContext {
  id: string;
  title: string;
  url: string;
  coverImage?: string;
  section: string;
}

const filePath = "cache/2026-01-21/blog/4b38cf50b8d9098b8e0bc99e5aa789a0.html";

try {
  const html: string = readFileSync(filePath, "utf-8");
  const { document } = parseHTML(html);

  console.log("--- Metadata ---");
  const title: string | undefined =
    document.querySelector('meta[property="og:title"]')?.getAttribute("content") || undefined;
  console.log(`Blog Title: ${title}`);

  console.log("\n--- Contextual Book Extraction ---");

  const booksWithContext: BookContext[] = [];
  const contentContainer: HTMLElement =
    (document.querySelector(".newsShowColumn") as HTMLElement) || (document.body as HTMLElement);

  // Usamos un objeto para mantener el estado y poder usar 'const' para la referencia
  const state = {
    currentSection: "Intro",
  };

  /**
   * Recorre el DOM secuencialmente para extraer libros manteniendo el contexto del encabezado.
   * @param node El nodo actual a procesar.
   */
  function traverse(node: Node): void {
    if (!node) {
      return;
    }

    // 1. Detectar Headers
    if (node instanceof document.defaultView.Element && /^H[1-6]$/.test(node.tagName)) {
      const headerText: string = node.textContent?.trim() || "";
      if (headerText) {
        state.currentSection = headerText;
      }
    }

    // 2. Detectar Links de Libros
    if (node instanceof document.defaultView.Element && node.tagName === "A") {
      const href: string | null = node.getAttribute("href");

      if (href?.includes("/book/show/")) {
        const match: RegExpMatchArray | null = href.match(/\/book\/show\/(\d+)/);

        if (match) {
          const id: string = match[1];
          const img: HTMLImageElement | null = node.querySelector("img");
          const text: string = node.textContent?.trim() || "";
          const imgAlt: string | null = img?.getAttribute("alt") || null;

          const candidate: BookContext = {
            id,
            title: "",
            url: href.startsWith("http") ? href : `https://www.goodreads.com${href}`,
            section: state.currentSection,
          };

          if (img) {
            candidate.coverImage = img.getAttribute("src") || undefined;
            if (imgAlt) {
              candidate.title = imgAlt;
            }
          } else if (text && text.length > 1 && !["Read more", "View details"].includes(text)) {
            candidate.title = text.replace(/\s+/g, " ");
          }

          const lastBook: BookContext | undefined = booksWithContext[booksWithContext.length - 1];

          if (lastBook && lastBook.id === id && lastBook.section === state.currentSection) {
            if (!lastBook.title && candidate.title) {
              lastBook.title = candidate.title;
            }
            if (!lastBook.coverImage && candidate.coverImage) {
              lastBook.coverImage = candidate.coverImage;
            }
          } else {
            booksWithContext.push(candidate);
          }
        }
      }
    }

    // Procesar hijos
    node.childNodes.forEach((child: ChildNode) => {
      traverse(child);
    });
  }

  traverse(contentContainer);

  const results: BookContext[] = booksWithContext.filter(
    (b: BookContext) => b.title || b.coverImage,
  );

  console.log(`\nTotal Book Mentions Found: ${results.length}`);

  const bySection = new Map<string, BookContext[]>();
  results.forEach((b: BookContext) => {
    const books: BookContext[] = bySection.get(b.section) || [];
    books.push(b);
    bySection.set(b.section, books);
  });

  bySection.forEach((books: BookContext[], section: string) => {
    console.log(`\n📂 [${section}] - ${books.length} books`);
    books
      .slice(0, 3)
      .forEach((b: BookContext) => console.log(`   - ${b.title || "No Title"} (${b.id})`));
    if (books.length > 3) {
      console.log(`   ... and ${books.length - 3} more.`);
    }
  });
} catch (error) {
  console.error("Error reading or parsing file:", error);
}
