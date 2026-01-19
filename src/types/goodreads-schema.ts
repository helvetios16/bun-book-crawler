/**
 * Interfaces representing the raw data structure from Goodreads (Next.js props).
 */

export interface ApolloNode {
  __ref?: string;
  legacyId?: string;
  title?: string;
  titleComplete?: string;
  description?: string;
  primaryContributorEdge?: {
    node?: {
      __ref?: string;
    };
  };
  work?: {
    __ref?: string;
  };
  details?: {
    numPages?: number;
    language?: {
      name?: string;
    };
    format?: string;
  };
  imageUrl?: string;
  name?: string;
  // Allow other properties since the graph is extensive
  [key: string]: unknown;
}

export interface GoodreadsApolloState {
  [key: string]: ApolloNode;
}

export interface GoodreadsPageProps {
  apolloState: GoodreadsApolloState;
}

export interface GoodreadsProps {
  pageProps: GoodreadsPageProps;
}

export interface GoodreadsNextData {
  props: GoodreadsProps;
}
