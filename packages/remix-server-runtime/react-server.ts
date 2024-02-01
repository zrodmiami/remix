import type { StaticHandler } from "@remix-run/router";

import type {
  HandleErrorFunction,
  RenderToReadableStreamFunction,
  ServerBuild,
} from "./build";
import type { AppLoadContext } from "./data";
import { getDevServerHooks } from "./dev";
import { ServerMode } from "./mode";
import { matchServerRoutes } from "./routeMatching";
import type { ServerRoute } from "./routes";
import { derive } from "./server";
import { isRedirectResponse, isResponse } from "./responses";

export type RSCRequestHandler = (
  request: Request,
  loadContext?: AppLoadContext
) => Promise<Response>;

export function createRSCRequestHandler(
  build: ServerBuild | (() => Promise<ServerBuild>),
  mode?: string
): RSCRequestHandler {
  let _build: ServerBuild;
  let routes: ServerRoute[];
  let serverMode: ServerMode;
  let staticHandler: StaticHandler;
  let errorHandler: HandleErrorFunction;
  let renderToReadableStream: RenderToReadableStreamFunction;

  return async (request, loadContext) => {
    _build = typeof build === "function" ? await build() : build;
    mode ??= _build.mode;
    if (!_build.entry.module.renderToReadableStream) {
      throw new Error(
        "The react server build does not have a renderToReadableStream function"
      );
    }
    renderToReadableStream = _build.entry.module.renderToReadableStream;

    if (typeof build === "function") {
      let derived = derive(_build, mode, true);
      routes = derived.routes;
      serverMode = derived.serverMode;
      staticHandler = derived.staticHandler;
      errorHandler = derived.errorHandler;
    } else if (!routes || !serverMode || !staticHandler || !errorHandler) {
      let derived = derive(_build, mode, true);
      routes = derived.routes;
      serverMode = derived.serverMode;
      staticHandler = derived.staticHandler;
      errorHandler = derived.errorHandler;
    }

    let url = new URL(request.url);
    let routeId = request.headers.get("Route");
    if (!routeId) {
      throw new Error("A 'Route' header is required");
    }

    let matches = matchServerRoutes(routes, url.pathname);
    let handleError = (error: unknown) => {
      if (mode === ServerMode.Development) {
        getDevServerHooks()?.processRequestError?.(error);
      }

      errorHandler(error, {
        context: loadContext as AppLoadContext,
        params: matches && matches.length > 0 ? matches[0].params : {},
        request,
      });
    };

    try {
      let response = await staticHandler.queryRoute(request, {
        routeId,
        requestContext: loadContext,
      });

      if (isRedirectResponse(response)) {
        // We don't have any way to prevent a fetch request from following
        // redirects. So we use the `X-Remix-Redirect` header to indicate the
        // next URL, and then "follow" the redirect manually on the client.
        let headers = new Headers(response.headers);
        headers.set("X-Remix-Redirect", headers.get("Location")!);
        headers.set("X-Remix-Status", response.status);
        headers.delete("Location");
        if (response.headers.get("Set-Cookie") !== null) {
          headers.set("X-Remix-Revalidate", "yes");
        }

        return new Response(null, {
          status: 204,
          headers,
        });
      }

      if (!isResponse(response)) {
        response = new Response(renderToReadableStream(response), {
          status: 200,
          headers: {
            "Content-Type": "text/x-component",
          },
        });
      }

      response.headers.set("X-Remix-Response", "yes");
      return response;
    } catch (error) {
      if (isResponse(error)) {
        error.headers.set("X-Remix-Catch", "yes");
        return error;
      }

      handleError(error);

      throw error;
    }
  };
}
