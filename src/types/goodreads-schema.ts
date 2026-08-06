/**
 * Zod schemas validating the raw data structure from Goodreads (Next.js props).
 *
 * Goodreads' `__NEXT_DATA__` payload is an unversioned, undocumented Apollo GraphQL
 * cache dump. These schemas only pin down the fields bukcraw actually reads — every
 * object uses `.passthrough()` so the thousands of unrelated fields in the Apollo
 * graph don't cause validation failures. A failure here means Goodreads changed the
 * shape of a field we depend on, which is exactly what we want to catch early instead
 * of silently extracting `undefined`.
 */
import { z } from "zod";

export const ApolloRefSchema = z.object({
  __ref: z.string().optional(),
});

// Goodreads serializes `legacyId` as a string on some nodes and a number on
// others — inconsistently, even across two Book nodes in the same payload.
const legacyIdSchema = z.union([z.string(), z.number()]).optional();

export const ApolloNodeSchema = z
  .object({
    __ref: z.string().optional(),
    legacyId: legacyIdSchema,
    title: z.string().optional(),
    titleComplete: z.string().optional(),
    description: z.string().optional(),
    primaryContributorEdge: z
      .object({
        node: ApolloRefSchema.optional(),
      })
      .optional(),
    work: ApolloRefSchema.optional(),
    details: z
      .object({
        // null when Goodreads doesn't have a page count for the edition.
        numPages: z.number().nullable().optional(),
        language: z.object({ name: z.string().optional() }).optional(),
        format: z.string().optional(),
      })
      .optional(),
    imageUrl: z.string().optional(),
    name: z.string().optional(),
    webUrl: z.string().optional(),
    stats: z
      .object({
        averageRating: z.number().optional(),
        ratingsCount: z.number().optional(),
      })
      .optional(),
  })
  .passthrough();

export const GoodreadsApolloStateSchema = z.record(z.string(), ApolloNodeSchema);

export const GoodreadsNextDataSchema = z.object({
  props: z.object({
    pageProps: z.object({
      apolloState: GoodreadsApolloStateSchema,
    }),
  }),
});

export type ApolloNode = z.infer<typeof ApolloNodeSchema>;
export type GoodreadsApolloState = z.infer<typeof GoodreadsApolloStateSchema>;
export type GoodreadsNextData = z.infer<typeof GoodreadsNextDataSchema>;
