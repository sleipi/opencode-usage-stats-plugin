import type { RouteHandler } from "./routes/route-handler";

export async function isPortInUse(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/`, {
      signal: AbortSignal.timeout(500),
    });
    await response.text();
    return true;
  } catch {
    return false;
  }
}

export function startServer(port: number, routes: RouteHandler[]): void {
  Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      for (const route of routes) {
        if (route.match(url)) {
          return route.handle(req, url);
        }
      }
      return new Response("Not found", { status: 404 });
    },
  });
  console.log(`Dashboard running at http://localhost:${port}`);
}
