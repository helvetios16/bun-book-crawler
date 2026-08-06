import type { Book } from "../types";
import { GoodreadsNextDataSchema } from "../types/goodreads-schema";
import { Logger } from "../utils/logger";

const log = new Logger("BookParser");

/**
 * Extracts book information from the raw Goodreads Next.js data.
 * @param jsonData The full JSON object parsed from the #__NEXT_DATA__ script tag.
 * @returns A Book object if extraction is successful, or null otherwise.
 */
export function parseBookData(jsonData: unknown): Book | null {
  const result = GoodreadsNextDataSchema.safeParse(jsonData);
  if (!result.success) {
    // A schema failure here usually means Goodreads changed the shape of
    // __NEXT_DATA__ — log the exact path/reason so it's actionable, not a silent null.
    log.warn(
      "__NEXT_DATA__ no coincide con el esquema esperado:",
      result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    );
    return null;
  }

  // Access the normalized Apollo state safely using the typed schema
  const state = result.data.props.pageProps.apolloState;

  // Helper to resolve references directly from the state map
  const resolve = (ref: string | undefined | null) => {
    if (!ref) {
      return null;
    }
    return state[ref] || null;
  };

  // Find the main book entry using Regex for flexibility (starts with Book: and has titles)
  const bookKey = Object.keys(state).find((key) => {
    const entry = state[key];
    return /^Book:/.test(key) && entry?.title && entry?.titleComplete;
  });

  if (!bookKey) {
    log.warn("No se encontró ninguna entrada 'Book:' con title y titleComplete en apolloState");
    return null;
  }

  const data = state[bookKey];

  if (!data) {
    return null;
  }

  // Resolve relationships directly using __ref
  const authorRef = data.primaryContributorEdge?.node?.__ref;
  const authorData = resolve(authorRef);

  const workRef = data.work?.__ref;
  const workData = resolve(workRef);

  const description = data.description
    ? data.description.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>?/gm, "") // Strip other HTML tags if desired, or keep simple
    : undefined;

  return {
    id: data.legacyId !== undefined ? String(data.legacyId) : "", // legacyId is string on some nodes, number on others
    legacyId: workData?.legacyId !== undefined ? Number(workData.legacyId) : undefined,
    averageRating: workData?.stats?.averageRating,
    title: data.title ?? "",
    titleComplete: data.titleComplete,
    author: authorData?.name,
    description: description,
    pageCount: data.details?.numPages ?? undefined,
    language: data.details?.language?.name,
    format: data.details?.format,
    coverImage: data.imageUrl,
    webUrl: data.webUrl,
  };
}
