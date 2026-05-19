/**
 * moderateText — single source of truth for text moderation across
 * comments / bios / posts / search queries.
 *
 * Wraps the v2 safety classifier and turns the label into an action that
 * the calling route can apply directly.
 */
import { classifyText, type SafetyLabel, type SafetyResult } from "./classifier";

export type ModerationContext = "comment" | "bio" | "post" | "search" | "display_name";
export type ModerationAction = "allow" | "hide" | "reject";

export type ModerationOutcome = {
  label: SafetyLabel;
  reasons: string[];
  signals: SafetyResult["signals"];
  action: ModerationAction;
  /** User-facing message (RO) explaining a rejection or hide. */
  message?: string;
};

/**
 * Decide what to do with a piece of user-generated text.
 *
 * Default policy (context-aware):
 *   blocked   → reject everywhere (illegal / hard-block content)
 *   adult     → reject for bio / display_name / search / post titles;
 *               hide for comments (still in DB but status='hidden')
 *   sensitive → reject for bio / display_name; allow elsewhere
 *   safe      → allow
 */
export function moderateText(
  text: string | null | undefined,
  ctx: ModerationContext = "comment",
): ModerationOutcome {
  const input = (text ?? "").trim();
  if (input.length === 0) {
    return { label: "safe", reasons: ["empty"], signals: {}, action: "allow" };
  }

  const result = classifyText({
    title: input,
    description: "",
    category: "",
    tags: [],
  });

  let action: ModerationAction = "allow";
  let message: string | undefined;

  switch (result.label) {
    case "blocked":
      action = "reject";
      message = "Conținutul conține termeni interziși și nu poate fi publicat.";
      break;
    case "adult":
      if (ctx === "bio" || ctx === "display_name" || ctx === "search" || ctx === "post") {
        action = "reject";
        message =
          ctx === "search"
            ? "Termenii de căutare conțin conținut pentru adulți și nu sunt permiși aici."
            : "Acest text conține conținut pentru adulți și nu poate fi publicat pe Swypik.";
      } else {
        action = "hide";
        message = "Mesajul a fost marcat ca explicit și este vizibil doar pentru tine și moderatori.";
      }
      break;
    case "sensitive":
      if (ctx === "bio" || ctx === "display_name") {
        action = "reject";
        message = "Conținutul profilului trebuie să fie neutru, fără referințe sugestive.";
      } else {
        action = "allow";
      }
      break;
    case "safe":
    default:
      action = "allow";
      break;
  }

  return {
    label: result.label,
    reasons: result.reasons,
    signals: result.signals,
    action,
    message,
  };
}
