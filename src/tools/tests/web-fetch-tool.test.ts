/**
 * Tests for the WebFetch tool.
 */

import { afterEach, describe, expect, it } from "bun:test";
import { createWebFetchTool } from "../web-fetch-tool.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("WebFetch tool", () => {
  it("rejects unsupported URL protocols", async () => {
    const tool = createWebFetchTool();

    await expect(tool.execute({
      url: "file:///etc/passwd"
    }, context())).rejects.toThrow("only supports http:// and https://");
  });

  it("upgrades HTTP URLs to HTTPS before fetching", async () => {
    const fetchedUrls: string[] = [];
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      fetchedUrls.push(String(input));
      return new Response("hello", {
        headers: { "content-type": "text/plain" }
      });
    }) as unknown as typeof fetch;

    const tool = createWebFetchTool();
    const result = await tool.execute({
      url: "http://example.com/path?q=1",
      format: "text"
    }, context());

    expect(fetchedUrls).toEqual(["https://example.com/path?q=1"]);
    expect(result).toEqual({
      content: "hello",
      isError: false
    });
  });

  it("converts HTML to markdown by default", async () => {
    globalThis.fetch = (async () => new Response("<html><body><h1>Title</h1><p>Hello <strong>there</strong>.</p></body></html>", {
      headers: { "content-type": "text/html; charset=utf-8" }
    })) as unknown as typeof fetch;

    const tool = createWebFetchTool();
    const result = await tool.execute({
      url: "https://example.com"
    }, context());

    expect(result.content).toContain("# Title");
    expect(result.content).toContain("Hello **there**.");
  });

  it("can return raw HTML", async () => {
    const html = "<main><h1>Raw</h1></main>";
    globalThis.fetch = (async () => new Response(html, {
      headers: { "content-type": "text/html" }
    })) as unknown as typeof fetch;

    const tool = createWebFetchTool();
    const result = await tool.execute({
      url: "https://example.com",
      format: "html"
    }, context());

    expect(result.content).toBe(html);
  });

  it("rejects binary content", async () => {
    globalThis.fetch = (async () => new Response("pdf-bytes", {
      headers: { "content-type": "application/pdf" }
    })) as unknown as typeof fetch;

    const tool = createWebFetchTool();

    await expect(tool.execute({
      url: "https://example.com/file.pdf"
    }, context())).rejects.toThrow("binary or unsupported content type");
  });

  it("rejects responses larger than 5MB", async () => {
    globalThis.fetch = (async () => new Response("", {
      headers: {
        "content-type": "text/plain",
        "content-length": "5242881"
      }
    })) as unknown as typeof fetch;

    const tool = createWebFetchTool();

    await expect(tool.execute({
      url: "https://example.com/large.txt"
    }, context())).rejects.toThrow("too large");
  });

  it("times out slow requests", async () => {
    globalThis.fetch = (async (_input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      })) as unknown as typeof fetch;

    const tool = createWebFetchTool();

    await expect(tool.execute({
      url: "https://example.com/slow",
      timeoutSeconds: 0.001
    }, context())).rejects.toThrow("timed out");
  });
});

function context() {
  return {
    workspaceRoot: "/workspace"
  };
}
