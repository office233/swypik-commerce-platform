/**
 * Evenimentele LiveKit care conduc ciclul de viață al unui stream:
 *  - track_published de la gazdă (`host:<creator>`)  → live (media confirmată)
 *  - participant_joined / participant_left            → număr de spectatori
 *  - room_finished                                     → ended
 * Camerele care nu sunt `live-<uuid>` (ex. apelurile Messenger) sunt ignorate.
 */
import type { WebhookEvent } from "livekit-server-sdk";
import { logger } from "@/lib/logger";
import { hostUserIdFromIdentity, streamIdFromRoom } from "./config";
import { markStreamEnded, markStreamLive, updateViewerCount } from "./lifecycle";

export type WebhookOutcome = "ignored" | "live" | "ended" | "viewers" | "noop";

export async function handleLiveKitEvent(event: WebhookEvent): Promise<WebhookOutcome> {
  const streamId = streamIdFromRoom(event.room?.name);
  if (!streamId) return "ignored";

  switch (event.event) {
    case "track_published": {
      const creatorId = hostUserIdFromIdentity(event.participant?.identity);
      if (!creatorId) return "noop"; // spectatorii nu pot publica, dar nu ne bazăm doar pe grant
      const stream = await markStreamLive({ streamId, creatorId });
      return stream ? "live" : "noop";
    }
    case "participant_joined":
    case "participant_left": {
      const total = Number(event.room?.numParticipants ?? 0);
      await updateViewerCount(streamId, Math.max(0, total - 1));
      return "viewers";
    }
    case "room_finished": {
      const changed = await markStreamEnded({ streamId });
      return changed ? "ended" : "noop";
    }
    default:
      logger.debug({ event: event.event, streamId }, "[live/webhook] unhandled event");
      return "noop";
  }
}

