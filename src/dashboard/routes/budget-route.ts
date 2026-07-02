import type { BudgetSettings } from "../../db/budget/budget-repo";
import type { Repos } from "../../db/repos";
import type { RouteHandler } from "./route-handler";

export function createBudgetRoute(
  readRepos: Repos,
  createWriteRepos: () => Repos,
): RouteHandler {
  return {
    match(url: URL): boolean {
      return url.pathname === "/api/budget";
    },

    handle(req: Request, _url: URL): Response | Promise<Response> {
      if (req.method === "GET") {
        const settings = readRepos.budget.get();
        if (!settings) return new Response(null, { status: 404 });
        return new Response(JSON.stringify(settings), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (req.method === "POST") {
        return req.json().then(
          (body: unknown) => {
            if (
              typeof body !== "object" ||
              body === null ||
              typeof (body as Record<string, unknown>).amount !== "number" ||
              typeof (body as Record<string, unknown>).workDays !== "number" ||
              typeof (body as Record<string, unknown>).periodStartDay !==
                "number"
            ) {
              return new Response("Invalid body", { status: 400 });
            }
            const settings: BudgetSettings = {
              amount: (body as Record<string, unknown>).amount as number,
              workDays: (body as Record<string, unknown>).workDays as number,
              periodStartDay: (body as Record<string, unknown>)
                .periodStartDay as number,
            };
            const writeRepos = createWriteRepos();
            try {
              writeRepos.budget.upsert(settings);
            } finally {
              writeRepos.close();
            }
            return new Response(null, { status: 200 });
          },
          () => new Response("Invalid JSON", { status: 400 }),
        );
      }

      return new Response("Method Not Allowed", { status: 405 });
    },
  };
}
