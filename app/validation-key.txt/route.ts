import { NextResponse } from "next/server";

/**
 * Pi Network domain ownership validation file.
 *
 * Pi Developer Portal asks app owners to host a string at
 * `https://<domain>/validation-key.txt` to prove control of the domain.
 *
 * We serve it from an env var so the key can be rotated without a rebuild.
 * Set `PI_VALIDATION_KEY` in the container env, redeploy is NOT required —
 * a container restart is enough (env is read at request time).
 *
 * Reference: https://pi-apps.github.io/pi-sdk-docs/quick-start/genai/Authentication
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(): NextResponse {
  const key = process.env.PI_VALIDATION_KEY?.trim() ?? "";
  return new NextResponse(key, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
