"use client";

import { useMemo, type ReactNode } from "react";
import InlineProductCard from "./InlineProductCard";

/**
 * BlogArticleBody — renders article MDX into React.
 *
 * Lightweight intentional approach (no full MDX compiler): we support
 * the markdown subset our editors actually use, plus a few custom tags
 * resolved at render time:
 *
 *   <InlineProductCard productId="62" variant="featured" badge="WINNER" />
 *   <ProductRow ids="62,118,205" />
 *   <Callout type="tip">Text aici</Callout>
 *
 * Why not @next/mdx?
 *   - Server bundle blows up with MDX compiler
 *   - Editors write content into the DB (no build step)
 *   - We need runtime parsing of admin-edited MDX
 *
 * Pipeline:
 *   1. Split MDX into blocks (paragraphs separated by blank lines)
 *   2. For each block, detect custom tags via regex and route to React
 *   3. Plain blocks pass through to a basic markdown formatter
 */
type Props = { mdx: string };

const PRODUCT_TAG_RE =
  /<InlineProductCard\s+([^/>]+?)\s*\/?>/g;
const PRODUCT_ROW_RE =
  /<ProductRow\s+ids=["']([^"']+)["']\s*\/?>/g;
const CALLOUT_OPEN_RE = /<Callout(?:\s+type=["']([a-z]+)["'])?\s*>/;
const CALLOUT_CLOSE_RE = /<\/Callout>/;

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w+)=(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    out[m[1]] = (m[2] ?? m[3] ?? m[4] ?? "").trim();
  }
  return out;
}

/**
 * Minimal markdown → JSX for paragraph-level blocks.
 * Supports: # h1, ## h2, ### h3, - list, > quote, **bold**, *italic*, [text](url).
 */
function renderInline(line: string): ReactNode[] {
  const parts: ReactNode[] = [];
  // Replace **bold** and *italic* and [link](url) — minimal pass.
  let rest = line;
  let key = 0;
  while (rest.length) {
    const bold = rest.match(/\*\*([^*]+)\*\*/);
    const italic = rest.match(/\*([^*]+)\*/);
    const link = rest.match(/\[([^\]]+)\]\(([^)]+)\)/);

    // Pick earliest match
    type M = { idx: number; len: number; node: ReactNode };
    const candidates: M[] = [];
    if (bold) candidates.push({
      idx: bold.index!, len: bold[0].length,
      node: <strong key={`b${key++}`}>{bold[1]}</strong>,
    });
    if (italic) candidates.push({
      idx: italic.index!, len: italic[0].length,
      node: <em key={`i${key++}`}>{italic[1]}</em>,
    });
    if (link) candidates.push({
      idx: link.index!, len: link[0].length,
      node: (
        <a key={`l${key++}`} href={link[2]} className="text-[#7C3AED] underline hover:no-underline">
          {link[1]}
        </a>
      ),
    });

    if (!candidates.length) {
      parts.push(rest);
      break;
    }
    candidates.sort((a, b) => a.idx - b.idx);
    const first = candidates[0];
    if (first.idx > 0) parts.push(rest.slice(0, first.idx));
    parts.push(first.node);
    rest = rest.slice(first.idx + first.len);
  }
  return parts;
}

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; level: 1 | 2 | 3; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "product"; props: Record<string, string> }
  | { kind: "productRow"; ids: string[] }
  | { kind: "callout"; type: string; text: string };

function splitBlocks(mdx: string): Block[] {
  // Normalize line endings and collapse 3+ blank lines.
  const normalized = mdx.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  const rawBlocks = normalized.split(/\n{2,}/);
  const blocks: Block[] = [];

  for (const raw of rawBlocks) {
    const block = raw.trim();
    if (!block) continue;

    // Product tag (standalone block — assume one per block)
    const prodMatch = PRODUCT_TAG_RE.exec(block);
    PRODUCT_TAG_RE.lastIndex = 0;
    if (prodMatch && block.startsWith("<InlineProductCard")) {
      blocks.push({ kind: "product", props: parseAttrs(prodMatch[1]) });
      continue;
    }

    const rowMatch = PRODUCT_ROW_RE.exec(block);
    PRODUCT_ROW_RE.lastIndex = 0;
    if (rowMatch && block.startsWith("<ProductRow")) {
      blocks.push({
        kind: "productRow",
        ids: rowMatch[1].split(",").map((s) => s.trim()).filter(Boolean),
      });
      continue;
    }

    const calloutOpen = CALLOUT_OPEN_RE.exec(block);
    if (calloutOpen) {
      const type = calloutOpen[1] || "info";
      const inner = block
        .replace(CALLOUT_OPEN_RE, "")
        .replace(CALLOUT_CLOSE_RE, "")
        .trim();
      blocks.push({ kind: "callout", type, text: inner });
      continue;
    }

    if (block.startsWith("### ")) { blocks.push({ kind: "h", level: 3, text: block.slice(4) }); continue; }
    if (block.startsWith("## "))  { blocks.push({ kind: "h", level: 2, text: block.slice(3) }); continue; }
    if (block.startsWith("# "))   { blocks.push({ kind: "h", level: 1, text: block.slice(2) }); continue; }

    if (block.startsWith("> ")) {
      blocks.push({ kind: "quote", text: block.slice(2) });
      continue;
    }

    // List (lines starting with - or *)
    const lines = block.split("\n");
    if (lines.every((l) => /^[-*]\s+/.test(l.trim()))) {
      blocks.push({
        kind: "list",
        items: lines.map((l) => l.trim().replace(/^[-*]\s+/, "")),
      });
      continue;
    }

    blocks.push({ kind: "p", text: block });
  }
  return blocks;
}

const CALLOUT_STYLES: Record<string, { bg: string; border: string; icon: string }> = {
  tip:     { bg: "rgba(124,58,237,.06)",  border: "rgba(124,58,237,.3)",  icon: "💡" },
  warning: { bg: "rgba(245,158,11,.08)",  border: "rgba(245,158,11,.3)",  icon: "⚠️" },
  success: { bg: "rgba(16,185,129,.08)",  border: "rgba(16,185,129,.3)",  icon: "✅" },
  info:    { bg: "rgba(59,130,246,.08)",  border: "rgba(59,130,246,.3)",  icon: "ℹ️" },
};

export default function BlogArticleBody({ mdx }: Props) {
  const blocks = useMemo(() => splitBlocks(mdx || ""), [mdx]);

  return (
    <div className="prose prose-lg max-w-none prose-headings:font-extrabold prose-headings:text-[#0D0D0D] prose-p:text-[#27272A] prose-p:leading-relaxed">
      {blocks.map((b, i) => {
        if (b.kind === "h") {
          if (b.level === 1) return <h1 key={i} className="text-3xl sm:text-4xl mt-10 mb-4">{renderInline(b.text)}</h1>;
          if (b.level === 2) return <h2 key={i} className="text-2xl sm:text-3xl mt-10 mb-3">{renderInline(b.text)}</h2>;
          return <h3 key={i} className="text-xl sm:text-2xl mt-8 mb-3">{renderInline(b.text)}</h3>;
        }
        if (b.kind === "p") {
          return <p key={i} className="mb-5 text-base sm:text-lg">{renderInline(b.text)}</p>;
        }
        if (b.kind === "list") {
          return (
            <ul key={i} className="my-5 space-y-2 list-disc pl-6 text-base sm:text-lg">
              {b.items.map((it, j) => (
                <li key={j} className="leading-relaxed">{renderInline(it)}</li>
              ))}
            </ul>
          );
        }
        if (b.kind === "quote") {
          return (
            <blockquote
              key={i}
              className="my-6 pl-4 border-l-4 italic text-zinc-600"
              style={{ borderColor: "#7C3AED" }}
            >
              {renderInline(b.text)}
            </blockquote>
          );
        }
        if (b.kind === "callout") {
          const s = CALLOUT_STYLES[b.type] || CALLOUT_STYLES.info;
          return (
            <div
              key={i}
              className="my-6 rounded-xl border p-4 flex gap-3"
              style={{ background: s.bg, borderColor: s.border }}
            >
              <div className="text-xl shrink-0">{s.icon}</div>
              <div className="text-[15px] leading-relaxed">{renderInline(b.text)}</div>
            </div>
          );
        }
        if (b.kind === "product") {
          const id = b.props.productId;
          if (!id) return null;
          return (
            <InlineProductCard
              key={i}
              productId={id}
              variant={(b.props.variant as any) || "compact"}
              badge={b.props.badge}
            />
          );
        }
        if (b.kind === "productRow") {
          return (
            <div key={i} className="not-prose my-8 grid sm:grid-cols-2 gap-4">
              {b.ids.map((id) => (
                <InlineProductCard key={id} productId={id} variant="comparison" />
              ))}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
