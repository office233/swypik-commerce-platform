import fs from "fs";
function ed(f, pairs) {
  let s = fs.readFileSync(f, "utf8");
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.log("MISS", f, JSON.stringify(a.slice(0, 60))); continue; }
    s = s.split(a).join(b);
  }
  fs.writeFileSync(f, s);
}
const BT = "`";
ed("components/chat/ProductModal.tsx", ["⭐","✅","📦","💰","🏆","🚀"].map(e => [`insights.push(${BT}${e} \${`, `insights.push(${BT}\${`]));
ed("components/checkout/CheckoutProductImage.tsx", [["cu fallback 📦.", "cu fallback Package."]]);
ed("components/home/OfferCard.tsx", [['{likeCount > 0 && <>❤️ {formatCount(likeCount)}</>}', '{likeCount > 0 && <><Heart size={12} className="inline" fill="currentColor" /> {formatCount(likeCount)}</>}']]);
ed("components/home/FeedFilterBar.tsx", [['★ {r}+', '<Star size={12} className="inline" fill="currentColor" /> {r}+']]);
ed("components/home/OffersFeed.tsx", [['<p className="text-3xl">🛍️</p>', '<p className="text-3xl"><ShoppingBag size={30} className="inline" /></p>']]);
ed("components/reels/Recorder.tsx", [['<span className="text-3xl">✓</span>', '<span className="text-3xl"><Check size={30} /></span>']]);
ed("components/verticals/VerticalRail.tsx", [['<span aria-hidden>✨</span>', '<span aria-hidden><Sparkles size={14} className="inline" /></span>']]);
ed("components/checkout/StripePaymentForm.tsx", [
  ['{a.is_default ? "★ " : ""}', '{a.is_default ? "* " : ""}'],
  ['⚠️ {error}', '<AlertTriangle size={14} className="inline" /> {error}'],
  ['<span className="text-lg">💳</span>', '<CreditCard size={18} />'],
]);
console.log("done");
