/**
 * Regula de acces la o piesă (funcție pură, fără DB):
 * admin sau artistul proprietar → oricând; altfel doar piese publicate,
 * iar cele premium doar cu unlock pe piesă sau pe albumul ei.
 */
import type { MusicTrackRow, MusicViewer } from "./types";

export type StreamableTrack = Pick<MusicTrackRow, "id" | "artist_user_id" | "status" | "is_premium" | "album_id">;

export function canStream(viewer: MusicViewer, track: StreamableTrack): boolean {
    if (viewer.isAdmin) return true;
    if (viewer.userId && viewer.userId === track.artist_user_id) return true;
    if (track.status !== "published") return false;
    if (!track.is_premium) return true;
    if (viewer.unlockedTrackIds.has(track.id)) return true;
    return Boolean(track.album_id && viewer.unlockedAlbumIds.has(track.album_id));
}
