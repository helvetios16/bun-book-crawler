import type { Book } from "../types";
import type { GoodreadsNextData } from "../types/goodreads-schema";

/**
 * Type guard to validate if the input is a valid GoodreadsNextData object.
 */
function isValidNextData(data: unknown): data is GoodreadsNextData {
  return (
    typeof data === "object" &&
    data !== null &&
    "props" in data &&
    typeof (data as GoodreadsNextData).props === "object" &&
    (data as GoodreadsNextData).props !== null &&
    "pageProps" in (data as GoodreadsNextData).props &&
    typeof (data as GoodreadsNextData).props.pageProps === "object" &&
    (data as GoodreadsNextData).props.pageProps !== null &&
    "apolloState" in (data as GoodreadsNextData).props.pageProps
  );
}

/**
 * Extracts book information from the raw Goodreads Next.js data.
 * @param jsonData The full JSON object parsed from the #__NEXT_DATA__ script tag.
 * @returns A Book object if extraction is successful, or null otherwise.
 */
export function parseBookData(jsonData: unknown): Book | null {
  if (!isValidNextData(jsonData)) {
    return null;
  }

  // Access the normalized Apollo state safely using the typed interface
  const state = jsonData.props.pageProps.apolloState;

  if (!state) {
    return null;
  }

  // Helper to resolve references directly from the state map
  const resolve = (ref: string | undefined | null) => {
    if (!ref) {
      return null;
    }
    return state[ref] || null;
  };

  // Find the main book entry using Regex for flexibility (starts with Book: and has titles)
  const bookKey = Object.keys(state).find(
    (key) => /^Book:/.test(key) && state[key].title && state[key].titleComplete,
  );

  if (!bookKey) {
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
    ? data.description
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]*>?/gm, "") // Strip other HTML tags if desired, or keep simple
    : undefined;

  return {
    id: data.legacyId ?? "", // Ensure string, though optional in interface, Book expects string
    legacyId: workData?.legacyId,
    title: data.title ?? "",
    titleComplete: data.titleComplete,
    author: authorData?.name,
    description: description,
    pages: data.details?.numPages,
    language: data.details?.language?.name,
    format: data.details?.format,
    coverImage: data.imageUrl,
  };
}
