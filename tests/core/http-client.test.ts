import { describe, expect, test } from "bun:test";
import { HttpClient } from "../../src/core/http-client";

describe("HttpClient - isBlocked()", () => {
  const client = new HttpClient();

  test("detects captcha keyword", () => {
    expect(client.isBlocked("<html><body>Please solve the captcha</body></html>")).toBe(true);
  });

  test("detects robot keyword", () => {
    expect(client.isBlocked("<html><body>Are you a robot?</body></html>")).toBe(true);
  });

  test("detects hcaptcha", () => {
    expect(client.isBlocked('<div class="hcaptcha-box"></div>')).toBe(true);
  });

  test("detects recaptcha", () => {
    expect(client.isBlocked('<div class="g-recaptcha" data-sitekey="abc"></div>')).toBe(true);
  });

  test("detects 'verify you are a human'", () => {
    expect(client.isBlocked("<p>Please verify you are a human to continue.</p>")).toBe(true);
  });

  test("case insensitive detection", () => {
    expect(client.isBlocked("<html>CAPTCHA REQUIRED</html>")).toBe(true);
    expect(client.isBlocked("<html>RoBoT detection</html>")).toBe(true);
  });

  test("returns false for normal book page", () => {
    const normalHtml = `
      <html>
        <head><title>Don't Let Go by Harlan Coben</title></head>
        <body>
          <div class="BookPage">
            <h1>Don't Let Go</h1>
            <span>by Harlan Coben</span>
            <div class="rating">4.05</div>
          </div>
        </body>
      </html>
    `;
    expect(client.isBlocked(normalHtml)).toBe(false);
  });

  test("returns false for empty HTML", () => {
    expect(client.isBlocked("")).toBe(false);
  });
});

describe("HttpClient - conditionalGet()", () => {
  const client = new HttpClient();

  test("returns notModified=false and content for a normal 200 response", async () => {
    // Fetch a real lightweight URL to verify the shape of the response
    const response = await client.conditionalGet("https://httpbin.org/get");

    expect(response.notModified).toBe(false);
    expect(response.status).toBe(200);
    expect(response.content).toBeTruthy();
    expect(typeof response.content).toBe("string");
  });

  test("returns notModified=false with status 0 on network error", async () => {
    const response = await client.conditionalGet("http://localhost:1/unreachable");

    expect(response.notModified).toBe(false);
    expect(response.status).toBe(0);
    expect(response.content).toBeNull();
  });

  test("sends If-None-Match header when etag is provided", async () => {
    // httpbin.org/headers echoes back the request headers
    const response = await client.conditionalGet("https://httpbin.org/headers", {
      etag: '"test-etag-123"',
    });

    expect(response.status).toBe(200);
    expect(response.content).toContain("If-None-Match");
    expect(response.content).toContain("test-etag-123");
  });

  test("sends If-Modified-Since header when lastModified is provided", async () => {
    const response = await client.conditionalGet("https://httpbin.org/headers", {
      lastModified: "Wed, 09 Apr 2026 00:00:00 GMT",
    });

    expect(response.status).toBe(200);
    expect(response.content).toContain("If-Modified-Since");
  });

  test("handles both conditional headers simultaneously", async () => {
    const response = await client.conditionalGet("https://httpbin.org/headers", {
      etag: '"dual-test"',
      lastModified: "Wed, 09 Apr 2026 00:00:00 GMT",
    });

    expect(response.status).toBe(200);
    expect(response.content).toContain("If-None-Match");
    expect(response.content).toContain("If-Modified-Since");
  });

  test("works without conditional headers (same as normal GET)", async () => {
    const response = await client.conditionalGet("https://httpbin.org/get");

    expect(response.notModified).toBe(false);
    expect(response.status).toBe(200);
    expect(response.content).toBeTruthy();
  });
});

describe("HttpClient - get() retry hook", () => {
  test("calls onRetryableStatus and retries when the server returns 429", async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;

    globalThis.fetch = (async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 429,
          statusText: "Too Many Requests",
          // Retry-After: 0 keeps the test fast instead of waiting out real backoff.
          headers: new Headers({ "Retry-After": "0" }),
        };
      }
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        text: async () => "<html>ok</html>",
      };
    }) as unknown as typeof fetch;

    try {
      const client = new HttpClient();
      const statuses: number[] = [];
      const content = await client.get("https://example.test/page", undefined, {
        onRetryableStatus: (status) => statuses.push(status),
      });

      expect(content).toBe("<html>ok</html>");
      expect(statuses).toEqual([429]);
      expect(callCount).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("HttpClient - constructor", () => {
  test("creates instance without cookies", () => {
    const client = new HttpClient();
    expect(client).toBeTruthy();
  });

  test("creates instance with cookies", () => {
    const client = new HttpClient("session=abc123; user=test");
    expect(client).toBeTruthy();
  });
});
