import {
  fallbackAccepted,
  normalizeBatchPayload,
  postLegacyEvents,
  validationError,
} from "./compat";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const batch = normalizeBatchPayload(body);

    if (!batch || batch.events.length !== 1) {
      return validationError("Expected a single valid event");
    }

    const legacy = await postLegacyEvents(req, batch);
    if (legacy && legacy.accepted === 1) return fallbackAccepted(1, "go-legacy");

    return fallbackAccepted(1);
  } catch (error) {
    console.error("[Social Events Fallback]", error);
    return fallbackAccepted(0);
  }
}
