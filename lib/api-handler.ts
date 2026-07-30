/**
 * Common API route error-handling wrapper.
 *
 * Usage:
 *   import { withErrorHandling } from "@/lib/api-handler";
 *   export const GET = withErrorHandling(async function GET(req) { ... });
 *
 * Catches any uncaught exception thrown by the handler, logs it with the
 * structured logger, and returns a consistent 500 JSON body:
 *   { error: "internal_error" }
 *
 * Does NOT alter the handler's own responses (4xx/5xx returned explicitly
 * by the route pass through untouched).
 */
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// Matches any Next.js App Router route handler signature:
// (request?, context?) => Response | Promise<Response>
type RouteHandler<Args extends unknown[]> = (
  ...args: Args
) => Response | Promise<Response>;

export function withErrorHandling<Args extends unknown[]>(
  handler: RouteHandler<Args>,
): RouteHandler<Args> {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      const req = args[0] as { url?: string; method?: string } | undefined;
      let route: string | undefined;
      try {
        route = req?.url ? new URL(req.url).pathname : undefined;
      } catch {
        route = req?.url;
      }
      logger.error(
        { err, route, method: req?.method },
        "unhandled API route error",
      );
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  };
}
