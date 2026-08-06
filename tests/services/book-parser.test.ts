import { describe, expect, test } from "bun:test";
import { parseBookData } from "../../src/services/book-parser.ts";

const validNextData = {
  props: {
    pageProps: {
      apolloState: {
        "Book:kca://book/amzn1.gr.book.test123": {
          legacyId: "12345",
          title: "Test Book",
          titleComplete: "Test Book: A Complete Title",
          description: "A test description with <b>bold</b> and <br/> line breaks",
          imageUrl: "https://images.gr-assets.com/books/test.jpg",
          webUrl: "/book/show/12345-test-book",
          details: {
            numPages: 350,
            language: { name: "English" },
            format: "Hardcover",
          },
          primaryContributorEdge: {
            node: { __ref: "Contributor:123" },
          },
          work: { __ref: "Work:456" },
        },
        "Contributor:123": {
          name: "Test Author",
        },
        "Work:456": {
          legacyId: "789",
          stats: { averageRating: 4.25 },
        },
      },
    },
  },
};

describe("parseBookData", () => {
  test("returns valid Book from correct __NEXT_DATA__", () => {
    const book = parseBookData(validNextData);
    expect(book).not.toBeNull();
    expect(book?.id).toBe("12345");
    expect(book?.title).toBe("Test Book");
    expect(book?.titleComplete).toBe("Test Book: A Complete Title");
    expect(book?.webUrl).toBe("/book/show/12345-test-book");
    expect(book?.coverImage).toBe("https://images.gr-assets.com/books/test.jpg");
    expect(book?.pageCount).toBe(350);
    expect(book?.language).toBe("English");
    expect(book?.format).toBe("Hardcover");
  });

  test("correctly resolves author from __ref", () => {
    const book = parseBookData(validNextData);
    expect(book).not.toBeNull();
    expect(book?.author).toBe("Test Author");
  });

  test("correctly resolves work legacyId from __ref", () => {
    const book = parseBookData(validNextData);
    expect(book).not.toBeNull();
    expect(book?.legacyId).toBe(789);
  });

  test("correctly resolves averageRating from work __ref", () => {
    const book = parseBookData(validNextData);
    expect(book).not.toBeNull();
    expect(book?.averageRating).toBe(4.25);
  });

  test("strips HTML from description", () => {
    const book = parseBookData(validNextData);
    expect(book).not.toBeNull();
    // <br/> replaced with newline, <b>bold</b> stripped to "bold"
    expect(book?.description).toContain("bold");
    expect(book?.description).not.toContain("<b>");
    expect(book?.description).not.toContain("<br/>");
  });

  test("returns null for empty object", () => {
    expect(parseBookData({})).toBeNull();
  });

  test("returns null for null", () => {
    expect(parseBookData(null)).toBeNull();
  });

  test("returns null for undefined", () => {
    expect(parseBookData(undefined)).toBeNull();
  });

  test("returns null for missing apolloState", () => {
    const data = {
      props: {
        pageProps: {},
      },
    };
    expect(parseBookData(data)).toBeNull();
  });

  test("returns null for apolloState with no Book: keys", () => {
    const data = {
      props: {
        pageProps: {
          apolloState: {
            "Contributor:123": { name: "Some Author" },
            "Work:456": { legacyId: "789" },
          },
        },
      },
    };
    expect(parseBookData(data)).toBeNull();
  });

  test("returns null for Book key missing title", () => {
    const data = {
      props: {
        pageProps: {
          apolloState: {
            "Book:kca://book/amzn1.gr.book.noTitle": {
              legacyId: "999",
              titleComplete: "Has titleComplete but not title",
            },
          },
        },
      },
    };
    expect(parseBookData(data)).toBeNull();
  });

  test("returns null for Book key missing titleComplete", () => {
    const data = {
      props: {
        pageProps: {
          apolloState: {
            "Book:kca://book/amzn1.gr.book.noTC": {
              legacyId: "999",
              title: "Has title but not titleComplete",
            },
          },
        },
      },
    };
    expect(parseBookData(data)).toBeNull();
  });

  test("handles missing optional fields gracefully", () => {
    const minimalData = {
      props: {
        pageProps: {
          apolloState: {
            "Book:kca://book/amzn1.gr.book.minimal": {
              legacyId: "555",
              title: "Minimal Book",
              titleComplete: "Minimal Book",
            },
          },
        },
      },
    };
    const book = parseBookData(minimalData);
    expect(book).not.toBeNull();
    expect(book?.id).toBe("555");
    expect(book?.title).toBe("Minimal Book");
    expect(book?.author).toBeUndefined();
    expect(book?.pageCount).toBeUndefined();
    expect(book?.language).toBeUndefined();
    expect(book?.averageRating).toBeUndefined();
  });

  // Regression: Goodreads serializes `legacyId` as a string on some nodes and a
  // number on others (even across two Book nodes in the same real payload), and
  // `details.numPages` can be `null` instead of omitted. An earlier version of the
  // Zod schema only accepted string/number-non-null respectively, which rejected
  // 100% of real book pages (every apolloState graph includes numeric-legacyId
  // User/Contributor nodes from reviews).
  test("accepts numeric legacyId on Book, Work, and Contributor nodes", () => {
    const data = {
      props: {
        pageProps: {
          apolloState: {
            "Book:kca://book/amzn1.gr.book.numericIds": {
              legacyId: 999111,
              title: "Numeric IDs Book",
              titleComplete: "Numeric IDs Book",
              primaryContributorEdge: { node: { __ref: "Contributor:222" } },
              work: { __ref: "Work:333" },
            },
            "Contributor:222": {
              legacyId: 222,
              name: "Numeric Author",
            },
            "Work:333": {
              legacyId: 333,
              stats: { averageRating: 3.9 },
            },
            "User:444": {
              legacyId: 444, // reviewer node present in every real payload
            },
          },
        },
      },
    };

    const book = parseBookData(data);
    expect(book).not.toBeNull();
    expect(book?.id).toBe("999111");
    expect(book?.legacyId).toBe(333);
    expect(book?.author).toBe("Numeric Author");
    expect(book?.averageRating).toBe(3.9);
  });

  test("accepts null numPages", () => {
    const data = {
      props: {
        pageProps: {
          apolloState: {
            "Book:kca://book/amzn1.gr.book.nullPages": {
              legacyId: "777",
              title: "No Page Count",
              titleComplete: "No Page Count",
              details: { numPages: null },
            },
          },
        },
      },
    };

    const book = parseBookData(data);
    expect(book).not.toBeNull();
    expect(book?.pageCount).toBeUndefined();
  });
});
