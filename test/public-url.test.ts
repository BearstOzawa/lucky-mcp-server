import { describe, expect, it } from "vitest";
import { publicUrl } from "../src/web-rules/public-url.js";

describe("publicUrl", () => {
  it("omits standard ports", () => {
    expect(publicUrl("wiki.example.com", 443, true)).toBe("https://wiki.example.com");
    expect(publicUrl("wiki.example.com", 80, false)).toBe("http://wiki.example.com");
  });

  it("keeps Lucky's common 16666 port", () => {
    expect(publicUrl("wiki.example.com", 16666, true)).toBe("https://wiki.example.com:16666");
  });
});
