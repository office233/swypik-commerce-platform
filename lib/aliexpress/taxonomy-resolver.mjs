// Pure ESM module — usable from .mjs scripts AND from Next.js TS code.
// Companion .d.ts provides type declarations for TS consumers.

/** Map AE root category id → high-level department for our taxonomy. */
export const AE_ROOT_TO_DEPARTMENT = Object.freeze({
  // Fashion / Apparel
  3:         { department: 'Fashion',     defaultCategory: 'Apparel' },
  200000343: { department: 'Fashion',     defaultCategory: 'Men' },         // Men's Clothing
  200000345: { department: 'Fashion',     defaultCategory: 'Women' },       // Women's Clothing
  200000297: { department: 'Fashion',     defaultCategory: 'Accessories' }, // Apparel Accessories
  200574005: { department: 'Fashion',     defaultCategory: 'Underwear' },   // Underwear
  200000532: { department: 'Fashion',     defaultCategory: 'Novelty' },     // Novelty & Special Use
  200003931: { department: 'Fashion',     defaultCategory: 'Activewear' },
  201768104: { department: 'Fashion',     defaultCategory: 'Sportswear' },
  322:       { department: 'Fashion',     defaultCategory: 'Shoes' },
  1524:      { department: 'Fashion',     defaultCategory: 'Bags' },
  1511:      { department: 'Fashion',     defaultCategory: 'Watches' },
  36:        { department: 'Fashion',     defaultCategory: 'Jewelry' },
  200165144: { department: 'Fashion',     defaultCategory: 'Hair' },        // Hair Extensions & Wigs
  320:       { department: 'Fashion',     defaultCategory: 'Wedding' },     // Weddings & Events

  // Beauty & Health
  66:        { department: 'Beauty',      defaultCategory: 'Health' },

  // Electronics
  44:        { department: 'Electronics', defaultCategory: 'Consumer' },    // Consumer Electronics
  509:       { department: 'Electronics', defaultCategory: 'Phones' },      // Phones & Telecom
  202192403: { department: 'Electronics', defaultCategory: 'Phone Accessories' },
  7:         { department: 'Electronics', defaultCategory: 'Computers' },
  502:       { department: 'Electronics', defaultCategory: 'Components' },
  52804:     { department: 'Electronics', defaultCategory: 'Phone Batteries' },
  5092101:   { department: 'Electronics', defaultCategory: 'Antennas' },
  5092206:   { department: 'Electronics', defaultCategory: 'Intercom' },
  202196203: { department: 'Electronics', defaultCategory: 'Walkie Talkies' },
  202197001: { department: 'Electronics', defaultCategory: 'Walkie Talkie Batteries' },
  200380144: { department: 'Electronics', defaultCategory: 'Walkie Talkie Accessories' },

  // Home
  6:         { department: 'Home',        defaultCategory: 'Appliances' },
  15:        { department: 'Home',        defaultCategory: 'Garden' },
  39:        { department: 'Home',        defaultCategory: 'Lighting' },
  1503:      { department: 'Home',        defaultCategory: 'Furniture' },
  13:        { department: 'Home',        defaultCategory: 'Improvement' },

  // Sports
  18:        { department: 'Sports',      defaultCategory: 'Outdoor' },

  // Toys
  26:        { department: 'Toys',        defaultCategory: 'Hobbies' },

  // Automotive
  34:        { department: 'Automotive',  defaultCategory: 'Parts' },
  201355758: { department: 'Automotive',  defaultCategory: 'Motorcycle' },

  // Food
  2:         { department: 'Food',        defaultCategory: 'General' },

  // Office / Tools
  21:        { department: 'Office',      defaultCategory: 'Supplies' },
  1420:      { department: 'Tools',       defaultCategory: 'General' },

  // Mother & Kids
  1501:      { department: 'Kids',        defaultCategory: 'General' },

  // Security
  30:        { department: 'Security',    defaultCategory: 'General' },

  // Industrial
  202216001: { department: 'Industrial',  defaultCategory: 'General' },

  // Books
  202228412: { department: 'Books',       defaultCategory: 'General' },

  // Catch-all
  201169612: { department: 'Other',       defaultCategory: 'Virtual' },
  201520802: { department: 'Other',       defaultCategory: 'Second-hand' },
  201355757: { department: 'Other',       defaultCategory: 'Misc' },
});

/** Decode percent-encoded display_name (handles double encoding like %25252d). */
export function decodeDisplayName(s) {
  if (!s) return '';
  let out = String(s);
  // Iteratively decode while pattern still present (max 4 passes).
  for (let i = 0; i < 4 && /%[0-9A-Fa-f]{2}/.test(out); i++) {
    try {
      const next = decodeURIComponent(out);
      if (next === out) break;
      out = next;
    } catch {
      break;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Slugify to lowercase ascii hyphenated. */
export function slugify(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Detect gender from label_hint string. */
export function detectGender(labelHint) {
  if (!labelHint) return null;
  const h = String(labelHint).toLowerCase();
  // Romanian + English markers.
  if (/\b(men|man|male|boys|barbati|baieti)\b/.test(h) || /^men[a-z]/.test(h)) return 'Men';
  if (/\b(women|woman|female|girls|femei|fete)\b/.test(h) || /femei/.test(h)) return 'Women';
  if (/\b(kids?|children|copii|baby)\b/.test(h)) return 'Kids';
  // Hint patterns from fixture: "menshirt", "menjeans" (no boundary)
  if (/^men/.test(h) && !/menstr/.test(h)) return 'Men';
  return null;
}

/**
 * Walk parent chain up to root (level 1) starting from a leaf id.
 * Returns array [root, ..., leaf] or [] if no entry found.
 */
export function walkChain(leafId, categoriesById) {
  const chain = [];
  const seen = new Set();
  let curId = Number(leafId);
  while (curId && !seen.has(curId)) {
    seen.add(curId);
    const node = categoriesById.get(curId);
    if (!node) break;
    chain.unshift(node);
    if (!node.parentId || node.parentId === 0) break;
    curId = Number(node.parentId);
  }
  return chain;
}

/**
 * Resolve taxonomy for an AE product.
 * @param input { displayName, labelHint, postCatIds, leafCatId, aeCategoryId }
 * @param categoriesById Map<number, {id,parentId,name,level}>
 */
export function resolveTaxonomy(input, categoriesById) {
  const displayName = decodeDisplayName(input.displayName || '');
  const labelHint = String(input.labelHint || '');
  const postCatIds = (input.postCatIds || []).map((x) => Number(x)).filter(Number.isFinite);
  const leafCatId = input.leafCatId ? Number(input.leafCatId) : null;
  const aeCategoryId = input.aeCategoryId ? Number(input.aeCategoryId) : null;

  // 1. Find a root category id (level=1) from the available signals.
  let chain = [];
  // Try leafCatId chain first.
  if (leafCatId) chain = walkChain(leafCatId, categoriesById);
  // If chain didn't reach level=1 root, try aeCategoryId.
  if ((!chain.length || chain[0].level !== 1) && aeCategoryId) {
    const c2 = walkChain(aeCategoryId, categoriesById);
    if (c2.length && (!chain.length || c2[0].level === 1)) chain = c2;
  }
  // If still no level=1 root, scan post_cat_ids for any level-1 entry.
  if (!chain.length || chain[0].level !== 1) {
    for (const id of postCatIds) {
      const node = categoriesById.get(id);
      if (node && node.level === 1) { chain = [node]; break; }
    }
  }
  // Last fallback: pick any level-2 in post_cat_ids that has a known parent.
  if (!chain.length) {
    for (const id of postCatIds) {
      const node = categoriesById.get(id);
      if (node) { chain = walkChain(id, categoriesById); break; }
    }
  }

  const root = chain[0] || null;
  const level2 = chain.find((n) => n.level === 2) || null;

  // 2. Department from root.
  const rootMap = root ? AE_ROOT_TO_DEPARTMENT[root.id] : null;
  let department = rootMap ? rootMap.department : 'Other';
  let category = rootMap ? rootMap.defaultCategory : 'Misc';

  // 3. Gender override for Fashion.
  if (department === 'Fashion') {
    const genderFromHint = detectGender(labelHint);
    if (genderFromHint) {
      category = genderFromHint;
    } else if (root && root.id === 200000343) {
      category = 'Men';
    } else if (root && root.id === 200000345) {
      category = 'Women';
    } else if (root && root.id === 200574005) {
      // Underwear root → default to Women if no hint
      category = 'Women';
    }
  }

  // 4. Subcategory.
  let subcategory = 'General';
  if (level2 && level2.name) {
    subcategory = level2.name;
  } else if (rootMap && rootMap.defaultCategory && rootMap.defaultCategory !== category) {
    subcategory = rootMap.defaultCategory;
  } else if (root && department !== 'Other') {
    subcategory = root.name;
  }

  // 5. Leaf.
  const leaf = displayName || (level2 ? level2.name : (root ? root.name : 'Misc'));

  // 6. Build canonical + slug.
  const parts = [department, category, subcategory, leaf].filter(Boolean);
  const canonical = parts.join(' > ');
  const slug = parts.map(slugify).filter(Boolean).join('-');

  // 7. Confidence.
  let confidence = 0.5;
  let reason = 'fallback_other_misc';
  if (root && rootMap) {
    confidence = level2 ? 0.9 : 0.75;
    reason = level2 ? 'ae_chain_with_level2' : 'ae_root_only';
    if (department === 'Fashion' && detectGender(labelHint)) {
      confidence = Math.min(0.95, confidence + 0.05);
      reason += '_gender_hint';
    }
  } else if (root) {
    confidence = 0.5;
    reason = 'ae_root_no_dept_mapping';
  }

  return {
    department,
    category,
    subcategory,
    leaf,
    canonical,
    slug,
    confidence,
    reason,
    aeCategoryId: leafCatId || aeCategoryId || (root ? root.id : null),
    aeRootCategoryId: root ? root.id : null,
    aeRootCategoryName: root ? root.name : null,
  };
}

/** Build categoriesById Map from a pg query result. */
export function categoriesFromRows(rows) {
  const m = new Map();
  for (const r of rows) {
    const id = Number(r.ae_category_id || r.id);
    m.set(id, {
      id,
      parentId: r.parent_id == null ? null : Number(r.parent_id),
      name: String(r.name || ''),
      nameRo: String(r.name_ro || ''),
      level: Number(r.level || 1),
    });
  }
  return m;
}

/** Helper to load categories from a pg Pool. */
export async function loadCategories(pool) {
  const { rows } = await pool.query(
    'SELECT ae_category_id, parent_id, name, name_ro, level FROM ae_categories WHERE is_active IS NOT FALSE'
  );
  return categoriesFromRows(rows);
}

// =============================================================================
// CHAIN CACHE INTEGRATION (ae_category_full_chain)
// =============================================================================

/**
 * Load full-chain cache from DB into Map<leafId, {chainIds[], chainNamesEn[], chainNamesRo[], depth, rootId}>
 */
export async function loadFullChainCache(pool) {
  const { rows } = await pool.query(
    'SELECT leaf_id, chain_ids, chain_names_en, chain_names_ro, depth, root_id FROM ae_category_full_chain'
  );
  const m = new Map();
  for (const r of rows) {
    m.set(Number(r.leaf_id), {
      chainIds: (r.chain_ids || []).map(Number),
      chainNamesEn: r.chain_names_en || [],
      chainNamesRo: r.chain_names_ro || [],
      depth: Number(r.depth),
      rootId: Number(r.root_id),
    });
  }
  return m;
}

/**
 * Resolve taxonomy using BOTH the chain cache (preferred) and the level-1/2 walker (fallback).
 * Returns the same shape as resolveTaxonomy + extra fields:
 *   - chainIds, chainNamesRo, unresolved (boolean), unresolvedReason
 */
export function resolveTaxonomyV2(input, categoriesById, chainCache) {
  const displayName = decodeDisplayName(input.displayName || '');
  const labelHint = String(input.labelHint || '');
  const postCatIds = (input.postCatIds || []).map((x) => Number(x)).filter(Number.isFinite);
  const leafCatId = input.leafCatId ? Number(input.leafCatId) : null;
  const aeCategoryId = input.aeCategoryId ? Number(input.aeCategoryId) : null;

  // 1. Try chain cache by leafCatId, aeCategoryId, then any postCatId.
  let cached = null;
  let probedLeaf = null;
  for (const cand of [leafCatId, aeCategoryId, ...postCatIds.slice().reverse()]) {
    if (!cand) continue;
    const c = chainCache && chainCache.get(Number(cand));
    if (c) { cached = c; probedLeaf = cand; break; }
  }

  if (cached) {
    const rootId = cached.rootId;
    const rootMap = AE_ROOT_TO_DEPARTMENT[rootId];
    let department = rootMap ? rootMap.department : 'Other';
    let category = rootMap ? rootMap.defaultCategory : 'Misc';

    if (department === 'Fashion') {
      const g = detectGender(labelHint);
      if (g) category = g;
      else if (rootId === 200000343) category = 'Men';
      else if (rootId === 200000345) category = 'Women';
    }

    // Subcategory = first chain element AFTER root that is NOT itself a level-1 root.
    // Fixture chains often contain multiple roots (e.g. 200000343, 200574005, ...) —
    // skip those to avoid mislabeling (e.g. Socks under root 'Underwear').
    let subcategory = (rootMap && rootMap.defaultCategory) || 'General';
    let subcategorySource = 'root_default';
    for (let i = 1; i < cached.chainIds.length; i++) {
      const cid = cached.chainIds[i];
      const cat = categoriesById && categoriesById.get(cid);
      if (cat && cat.level === 1) continue; // skip foreign roots
      // Use this entry if it has a usable name (from ae_categories or chain cache).
      const nameRo = (cat && (cat.nameRo || cat.name)) || cached.chainNamesRo[i] || cached.chainNamesEn[i];
      if (nameRo && nameRo.trim()) {
        subcategory = nameRo;
        subcategorySource = cat ? `ae_cat_l${cat.level}` : 'chain_cache';
        break;
      }
    }

    const leafName = cached.chainNamesRo[cached.depth - 1] || cached.chainNamesEn[cached.depth - 1] || displayName || subcategory;

    const parts = [department, category, subcategory, leafName].filter(Boolean);
    const canonical = parts.join(' > ');
    const slug = parts.map(slugify).filter(Boolean).join('-');

    const unresolved = !rootMap;
    const unresolvedReason = unresolved ? `root_${rootId}_no_department_map` : null;
    const confidence = unresolved ? 0.4 : (cached.depth >= 3 ? 0.95 : 0.85);
    const reason = unresolved ? 'chain_cache_no_dept' : `chain_cache_depth${cached.depth}`;

    return {
      department, category, subcategory, leaf: leafName,
      canonical, slug, confidence, reason,
      aeCategoryId: probedLeaf,
      aeRootCategoryId: rootId,
      aeRootCategoryName: cached.chainNamesEn[0] || (categoriesById && categoriesById.get(rootId) && categoriesById.get(rootId).name) || null,
      chainIds: cached.chainIds,
      chainNamesRo: cached.chainNamesRo,
      unresolved,
      unresolvedReason,
    };
  }

  // 2. Fallback to legacy resolver (chain walker on ae_categories).
  const legacy = resolveTaxonomy(input, categoriesById);
  const unresolved = !legacy.aeRootCategoryId || !AE_ROOT_TO_DEPARTMENT[legacy.aeRootCategoryId];
  return {
    ...legacy,
    chainIds: [],
    chainNamesRo: [],
    unresolved,
    unresolvedReason: unresolved ? 'no_chain_cache_no_root_dept_map' : null,
  };
}