import { describe, expect, test } from "bun:test";
import {
  esc,
  fmt,
  fmtCompact,
  fmtCost,
  renderTokens,
} from "../../../src/dashboard/templates/formatters";

describe("formatters", () => {
  describe("fmtCompact", () => {
    test("formats numbers below 1000 as-is", () => {
      expect(fmtCompact(0)).toBe("0");
      expect(fmtCompact(999)).toBe("999");
    });

    test("formats thousands with k suffix", () => {
      expect(fmtCompact(1_000)).toBe("1k");
      expect(fmtCompact(1_500)).toBe("1.5k");
      expect(fmtCompact(10_000)).toBe("10k");
    });

    test("formats millions with m suffix", () => {
      expect(fmtCompact(1_000_000)).toBe("1m");
      expect(fmtCompact(2_500_000)).toBe("2.5m");
    });
  });

  describe("esc", () => {
    test("escapes HTML special characters", () => {
      expect(esc('<script>alert("x")</script>&')).toBe(
        "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;",
      );
    });

    test("returns plain strings unchanged", () => {
      expect(esc("hello world")).toBe("hello world");
    });
  });

  describe("fmt", () => {
    test("formats numbers with locale separators", () => {
      const result = fmt(1234);
      expect(result).toContain("1");
      expect(result).toContain("234");
    });
  });

  describe("fmtCost", () => {
    test("formats zero as $0.00", () => {
      expect(fmtCost(0)).toBe("$0.00");
    });

    test("formats sub-cent values with 4 decimals", () => {
      expect(fmtCost(0.0042)).toBe("$0.0042");
      expect(fmtCost(0.0099)).toBe("$0.0099");
    });

    test("formats normal values with 2 decimals", () => {
      expect(fmtCost(5.54)).toBe("$5.54");
      expect(fmtCost(0.01)).toBe("$0.01");
      expect(fmtCost(123.4)).toBe("$123.40");
    });

    test("formats negative values as $0.00", () => {
      expect(fmtCost(-1)).toBe("$0.00");
    });
  });

  describe("renderTokens", () => {
    test("includes cache and reasoning when present", () => {
      const html = renderTokens(1000, 500, 250, 100);
      expect(html).toContain("1.5k in");
      expect(html).toContain("33% cached");
      expect(html).toContain("250 out");
      expect(html).toContain("100 reasoning");
    });

    test("omits reasoning segment when zero", () => {
      const html = renderTokens(100, 0, 50, 0);
      expect(html).not.toContain("reasoning");
    });

    test("omits cache info when cache is zero", () => {
      const html = renderTokens(100, 0, 50, 10);
      expect(html).not.toContain("cached");
    });

    test("handles all zeros", () => {
      const html = renderTokens(0, 0, 0, 0);
      expect(html).toContain("0 in");
      expect(html).toContain("0 out");
    });
  });
});
