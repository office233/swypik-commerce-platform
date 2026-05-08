// Patch ChatInterface.tsx with cart + categories + renderCartTab
const fs = require('fs');
const path = 'd:\\Aicevrei\\components\\ChatInterface.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Categories: query → displayMsg + cjQuery
const oldCats = `{ label: "🎧 Căști", query: "vreau căști wireless bluetooth" },
  { label: "📱 Telefon", query: "accesorii telefon husa incarcator" },
  { label: "💄 Beauty", query: "produse beauty skincare" },
  { label: "🏋️ Fitness", query: "echipament fitness sport" },
  { label: "🚗 Auto", query: "accesorii auto mașină" },
  { label: "🏠 Casă", query: "gadget pentru casă bucătărie" },
  { label: "💡 LED", query: "lumini LED bandă RGB" },
  { label: "⌚ Ceasuri", query: "ceas smart watch inteligent" },
  { label: "🎮 Gaming", query: "accesorii gaming mouse tastatura" },
  { label: "🎁 Cadouri", query: "cadou gadget unic" },
  { label: "👕 Fashion", query: "accesorii fashion bijuterii" },
  { label: "📷 Foto", query: "cameră foto accesorii" },`;

const newCats = `{ label: "🎧 Căști", displayMsg: "Căut căști wireless", cjQuery: "wireless earbuds" },
  { label: "📱 Telefon", displayMsg: "Căut accesorii telefon", cjQuery: "phone accessories" },
  { label: "💄 Beauty", displayMsg: "Căut produse beauty", cjQuery: "beauty skincare" },
  { label: "🏋️ Fitness", displayMsg: "Căut echipament fitness", cjQuery: "fitness sport" },
  { label: "🚗 Auto", displayMsg: "Căut accesorii auto", cjQuery: "car accessories" },
  { label: "🏠 Casă", displayMsg: "Căut gadgeturi casă", cjQuery: "home gadget" },
  { label: "💡 LED", displayMsg: "Căut lumini LED", cjQuery: "LED strip light" },
  { label: "⌚ Ceasuri", displayMsg: "Căut ceasuri smart", cjQuery: "smart watch" },
  { label: "🎮 Gaming", displayMsg: "Căut accesorii gaming", cjQuery: "gaming accessories" },
  { label: "🎁 Cadouri", displayMsg: "Căut idei cadou", cjQuery: "gift gadget" },
  { label: "👕 Fashion", displayMsg: "Căut accesorii fashion", cjQuery: "fashion jewelry" },
  { label: "📷 Foto", displayMsg: "Căut echipament foto", cjQuery: "camera accessories" },`;
code = code.replace(oldCats, newCats);

// 2. cartCount → cartItems
code = code.replace('const [cartCount, setCartCount] = useState(0);', 'const [cartItems, setCartItems] = useState<ChatProduct[]>([]);');

// 3. sendMessage signature
code = code.replace('async function sendMessage(text?: string) {', 'async function sendMessage(text?: string, directCjQuery?: string) {');

// 4. Add directCjQuery to fetch body
code = code.replace(
  'message: msg,\r\n          sessionId,\r\n          chatHistory:',
  'message: msg,\r\n          sessionId,\r\n          directCjQuery: directCjQuery || undefined,\r\n          chatHistory:'
);

// 5. Replace checkout state + logic
code = code.replace(
  `const [checkoutProduct, setCheckoutProduct] = useState<ChatProduct | null>(null);`,
  `const [showCheckoutForm, setShowCheckoutForm] = useState(false);`
);

code = code.replace(
  `function startCheckout(product: ChatProduct) {\r\n    setCheckoutProduct(product);\r\n    setSelectedProduct(null);\r\n  }`,
  `function addToCart(product: ChatProduct) {\r\n    setCartItems((prev) => [...prev, product]);\r\n    setSelectedProduct(null);\r\n    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: \`🛒 **\${product.title}** — \${product.price} lei adăugat în coș!\\nApasă pe **Coș** pentru a finaliza.\`, timestamp: new Date() }]);\r\n  }\r\n\r\n  function removeFromCart(index: number) {\r\n    setCartItems((prev) => prev.filter((_, i) => i !== index));\r\n  }\r\n\r\n  const cartTotal = cartItems.reduce((sum, p) => sum + p.price, 0);`
);

// 6. submitOrder: checkoutProduct → cartItems
code = code.replace('if (!checkoutProduct) return;', 'if (cartItems.length === 0) return;');
code = code.replace(
  `product: checkoutProduct,\r\n          quantity: 1,\r\n          customer: checkoutForm,`,
  `products: cartItems,\r\n          customer: checkoutForm,`
);
code = code.replace(
  `setCheckoutProduct(null);\r\n      setCheckoutForm({ name: "", email: "", phone: "", address: "", city: "", county: "" });\r\n      setCartCount((c) => c + 1);`,
  `setCartItems([]);\r\n      setShowCheckoutForm(false);\r\n      setCheckoutForm({ name: "", email: "", phone: "", address: "", city: "", county: "" });\r\n      setActiveTab("chat");`
);

// 7. Fix success/error messages
code = code.replace(
  /data\.checkoutUrl\s*\?\s*`✅ Comanda pentru \*\*\$\{checkoutProduct\.title\}\*\*.*?`\s*:\s*`✅ Comanda pentru \*\*\$\{checkoutProduct\.title\}\*\*.*?`/s,
  'data.checkoutUrl ? `✅ Comanda (${cartTotal} lei) creată!\\n👉 [Plătește acum](${data.checkoutUrl})` : `✅ Comanda înregistrată! Te contactăm pe ${checkoutForm.phone}.`'
);

// 8. Category grid: flex-wrap → grid 3col
code = code.replace('flex flex-wrap gap-2', 'grid grid-cols-3 gap-2');
code = code.replace(/onClick=\{.*?sendMessage\(action\.query\)\}/g, 'onClick={() => sendMessage(action.displayMsg, action.cjQuery)}');

// 9. startCheckout → addToCart references
code = code.replace(/startCheckout\(product\)/g, 'addToCart(product)');
code = code.replace(/startCheckout\(selectedProduct\)/g, 'addToCart(selectedProduct)');

// 10. cartCount → cartItems.length
code = code.replace(/cartCount > 0/g, 'cartItems.length > 0');
code = code.replace(/\{cartCount\}/g, '{cartItems.length}');
code = code.replace(/`Coș \$\{cartCount > 0/g, '`Coș ${cartItems.length > 0');
code = code.replace(/\(cartCount\)/g, '(cartItems.length)');

// 11. Content area: add cart tab switch
code = code.replace('{renderChat()}', '{activeTab === "cart" ? renderCartTab() : renderChat()}');

// 12. Replace old checkout modal with new one
const oldModal = `{checkoutProduct && (`;
const newModal = `{showCheckoutForm && (`;
code = code.replace(oldModal, newModal);
code = code.replace(/setCheckoutProduct\(null\)/g, 'setShowCheckoutForm(false)');
code = code.replace('Finalizează comanda', 'Finalizează ({cartItems.length} produse)');

// Remove old product summary
code = code.replace(
  /\{\/\* Product summary \*\/\}[\s\S]*?\{checkoutProduct\.price\} lei/,
  '{/* Cart summary */}\r\n              <div className="mb-4 space-y-2">\r\n                {cartItems.map((item, i) => (<div key={i} className="flex items-center gap-2 rounded-lg bg-white/5 p-2"><p className="flex-1 text-xs text-white truncate">{item.title}</p><p className="text-sm font-bold text-emerald-400">{item.price} lei</p></div>))}\r\n                <div className="flex items-center justify-between rounded-lg bg-violet-500/10 p-3"><span className="text-sm font-bold">Total</span><span className="text-xl font-black text-emerald-400">{cartTotal} lei</span></div>\r\n              </div>\r\n              {/* Hidden price */}\r\n              {cartTotal'
);

// Fix the submit button price
code = code.replace(/\$\{checkoutProduct\.price\} lei/g, '${cartTotal} lei');

// 13. Add renderCartTab function before Main render
const cartTabFn = `
  /* ─── Render Cart Tab ─── */
  function renderCartTab() {
    return (
      <div className="px-4 pt-6 pb-32 animate-fadeIn">
        <h2 className="text-2xl font-black mb-4">🛒 Coșul tău</h2>
        {cartItems.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingCart className="mx-auto mb-4 text-white/20" size={48} />
            <p className="text-white/40 text-sm">Coșul e gol. Caută produse!</p>
            <button onClick={() => setActiveTab("home")} className="mt-4 rounded-xl bg-violet-500/20 px-6 py-2.5 text-sm font-bold text-violet-300">Explorează</button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {cartItems.map((item, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  {item.images?.[0] && <img src={item.images[0]} alt="" className="h-16 w-16 rounded-xl object-cover" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{item.title}</p>
                    <p className="text-xs text-white/40">~{item.deliveryDays} zile</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-emerald-400">{item.price} lei</p>
                    <button onClick={() => removeFromCart(i)} className="text-[10px] text-red-400/60 hover:text-red-400">Șterge</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-violet-500/10 border border-violet-500/20 p-4">
              <span className="text-sm font-bold">Total ({cartItems.length} produse)</span>
              <span className="text-2xl font-black text-emerald-400">{cartTotal} lei</span>
            </div>
            <button onClick={() => setShowCheckoutForm(true)} className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 py-4 text-base font-black text-black">Finalizează comanda 💳</button>
            <p className="mt-2 text-center text-[11px] text-white/30">Transport inclus • Plată securizată</p>
          </>
        )}
      </div>
    );
  }

`;
code = code.replace('  /* ─── Main render ─── */', cartTabFn + '  /* ─── Main render ─── */');

fs.writeFileSync(path, code, 'utf8');
console.log('✅ ChatInterface.tsx patched successfully');
