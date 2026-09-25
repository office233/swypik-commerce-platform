/** Link-uri Messenger fără dependențe de server (folosite și în componente client). */

export const DM_ENTRY_KINDS = ["user", "seller", "order", "food_order"] as const;
export type DmEntryKind = (typeof DM_ENTRY_KINDS)[number];
export type DmEntry = { kind: DmEntryKind; id: string };

/** `/messages/new?<kind>=<id>` — link-ul folosit de toate butoanele „Mesaj”. */
export function dmEntryHref(entry: DmEntry): string {
  return `/messages/new?${entry.kind}=${encodeURIComponent(entry.id)}`;
}

export function conversationPath(conversationId: string): string {
  return `/messages/${conversationId}`;
}

export const INBOX_PATH = "/inbox";
