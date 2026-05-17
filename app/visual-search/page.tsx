import { notFound } from "next/navigation";

export const dynamic = "force-static";

export default function VisualSearchPage() {
  // Feature gated: hide until CLIP integration ships.
  if (process.env.NEXT_PUBLIC_FEATURE_VISUAL_SEARCH !== "1") {
    notFound();
  }
  return null;
}
