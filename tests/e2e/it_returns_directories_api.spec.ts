import { expect, test } from "@playwright/test";

test.describe("/api/directories endpoint", () => {
  test("returns JSON array of directories", async ({ request }) => {
    const response = await request.get("/api/directories");
    expect(response.ok()).toBe(true);

    const contentType = response.headers()["content-type"];
    expect(contentType).toContain("application/json");

    const dirs = await response.json();
    expect(Array.isArray(dirs)).toBe(true);
  });

  test("contains seeded directories", async ({ request }) => {
    const response = await request.get("/api/directories");
    const dirs = await response.json();

    expect(dirs).toContain("/tmp/e2e-project");
    expect(dirs).toContain("/tmp/e2e-other");
  });

  test("does not contain duplicate entries", async ({ request }) => {
    const response = await request.get("/api/directories");
    const dirs: string[] = await response.json();

    const unique = new Set(dirs);
    expect(unique.size).toBe(dirs.length);
  });
});
