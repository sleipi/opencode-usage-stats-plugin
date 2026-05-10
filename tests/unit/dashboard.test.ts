import { describe, expect, test } from "bun:test";
import { esc, fmtCompact, renderTokens } from "../../src/dashboard";

describe("dashboard utility rendering", () => {
  test("fmtCompact formats thousands and millions", () => {
    expect(fmtCompact(999)).toBe("999");
    expect(fmtCompact(1_000)).toBe("1k");
    expect(fmtCompact(1_500)).toBe("1.5k");
    expect(fmtCompact(2_000_000)).toBe("2m");
  });

  test("esc escapes HTML special chars", () => {
    expect(esc('<script>alert("x")</script>&')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;",
    );
  });

  test("renderTokens includes cache and reasoning when present", () => {
    const html = renderTokens(1000, 500, 250, 100);
    expect(html.includes("1.5k in")).toBe(true);
    expect(html.includes("33% cached")).toBe(true);
    expect(html.includes("250 out")).toBe(true);
    expect(html.includes("100 reasoning")).toBe(true);
  });

  test("renderTokens omits reasoning segment when zero", () => {
    const html = renderTokens(100, 0, 50, 0);
    expect(html.includes("reasoning")).toBe(false);
  });
});
