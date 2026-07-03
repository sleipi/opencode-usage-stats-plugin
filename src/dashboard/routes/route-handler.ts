export interface RouteHandler {
  match(url: URL): boolean;
  handle(req: Request, url: URL): Response | Promise<Response>;
}
