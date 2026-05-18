// Lightweight unit tests for taxonomy-resolver.
// Run: node lib/aliexpress/__tests__/taxonomy-resolver.test.mjs
import assert from 'node:assert/strict';
import {
  resolveTaxonomy,
  decodeDisplayName,
  detectGender,
  slugify,
  categoriesFromRows,
} from '../taxonomy-resolver.mjs';

// Minimal AE category fixture covering tests below.
const rows = [
  // roots (level 1)
  { ae_category_id: 200000343, parent_id: null, name: "Men's Clothing",   level: 1 },
  { ae_category_id: 200000345, parent_id: null, name: "Women's Clothing", level: 1 },
  { ae_category_id: 200574005, parent_id: null, name: 'Underwear',        level: 1 },
  { ae_category_id: 66,        parent_id: null, name: 'Beauty & Health',  level: 1 },
  { ae_category_id: 44,        parent_id: null, name: 'Consumer Electronics', level: 1 },
  { ae_category_id: 509,       parent_id: null, name: 'Phones & Telecommunications', level: 1 },
  { ae_category_id: 6,         parent_id: null, name: 'Home Appliances',  level: 1 },
  { ae_category_id: 200000532, parent_id: null, name: 'Novelty & Special Use', level: 1 },
  // level 2 children
  { ae_category_id: 200001808, parent_id: 200000343, name: 'Jeans',         level: 2 },
  { ae_category_id: 200001868, parent_id: 200000343, name: 'Casual Pants',  level: 2 },
  { ae_category_id: 100001234, parent_id: 200000345, name: 'Dresses',       level: 2 },
  { ae_category_id: 100002000, parent_id: 200574005, name: 'Bras & Bralettes', level: 2 },
  { ae_category_id: 100003000, parent_id: 66,        name: 'Makeup',        level: 2 },
  { ae_category_id: 100004000, parent_id: 509,       name: 'Mobile Phones', level: 2 },
  { ae_category_id: 100005000, parent_id: 44,        name: 'TV & Home Theater', level: 2 },
  { ae_category_id: 100006000, parent_id: 6,         name: 'Refrigerators & Freezers', level: 2 },
];
const cats = categoriesFromRows(rows);

let pass = 0, fail = 0;
function t(label, fn) {
  try { fn(); pass++; console.log('  ok  ', label); }
  catch (e) { fail++; console.error('  FAIL', label, '\n      ', e.message); }
}

console.log('== helpers ==');
t('decodeDisplayName handles double encoding', () => {
  assert.equal(decodeDisplayName('T%25252dShirts & Polos'), 'T-Shirts & Polos');
  assert.equal(decodeDisplayName('Cover%25252dUps'), 'Cover-Ups');
});
t('decodeDisplayName passthrough plain', () => {
  assert.equal(decodeDisplayName('Hoodies & Sweatshirts'), 'Hoodies & Sweatshirts');
});
t('slugify basic', () => {
  assert.equal(slugify('Fashion > Women > Underwear > Bras'), 'fashion-women-underwear-bras');
});
t('detectGender hints', () => {
  assert.equal(detectGender('menshirt'), 'Men');
  assert.equal(detectGender('menjeans'), 'Men');
  assert.equal(detectGender('lenjerie_femei!'), 'Women');
  assert.equal(detectGender('jacketvest women'), 'Women');
  assert.equal(detectGender(''), null);
});

console.log('== resolveTaxonomy ==');
t('Socks (Men root, no hint) → Fashion > Men > .. > Socks', () => {
  const r = resolveTaxonomy({
    displayName: 'Socks',
    labelHint: '',
    postCatIds: [200000343, 200574005, 200000384, 202219290],
    leafCatId: 202227209,
  }, cats);
  assert.equal(r.department, 'Fashion');
  assert.equal(r.category, 'Men');
  assert.equal(r.leaf, 'Socks');
});

t('Wool & Trench Coats (Men root, leaf=Jeans dummy) → Fashion > Men > Jeans > leaf', () => {
  const r = resolveTaxonomy({
    displayName: 'Wool & Trench Coats',
    labelHint: '',
    postCatIds: [200000343, 200574005, 200001808],
    leafCatId: 200001808,
  }, cats);
  assert.equal(r.department, 'Fashion');
  assert.equal(r.category, 'Men');
  assert.equal(r.subcategory, 'Jeans');
  assert.equal(r.leaf, 'Wool & Trench Coats');
});

t('Underwear with women hint → Fashion > Women', () => {
  const r = resolveTaxonomy({
    displayName: 'Bras & Bralettes',
    labelHint: 'brassbracelet',
    postCatIds: [200574005, 100002000],
    leafCatId: 100002000,
  }, cats);
  assert.equal(r.department, 'Fashion');
  assert.equal(r.category, 'Women');  // root 200574005 default
  assert.equal(r.subcategory, 'Bras & Bralettes');
});

t('Mobile Phones → Electronics > Phones', () => {
  const r = resolveTaxonomy({
    displayName: 'Mobile Phones',
    labelHint: '',
    postCatIds: [509, 100004000],
    leafCatId: 100004000,
  }, cats);
  assert.equal(r.department, 'Electronics');
  assert.equal(r.category, 'Phones');
  assert.equal(r.subcategory, 'Mobile Phones');
});

t('Eye Makeup → Beauty', () => {
  const r = resolveTaxonomy({
    displayName: 'Eye Makeup',
    labelHint: '',
    postCatIds: [66, 100003000],
    leafCatId: 100003000,
  }, cats);
  assert.equal(r.department, 'Beauty');
});

t('Refrigerators → Home', () => {
  const r = resolveTaxonomy({
    displayName: 'Refrigerators & Freezers',
    labelHint: '',
    postCatIds: [6, 100006000],
    leafCatId: 100006000,
  }, cats);
  assert.equal(r.department, 'Home');
  assert.equal(r.subcategory, 'Refrigerators & Freezers');
});

t('TV & Home Theater → Electronics', () => {
  const r = resolveTaxonomy({
    displayName: 'TV & Home Theater',
    labelHint: '',
    postCatIds: [44, 100005000],
    leafCatId: 100005000,
  }, cats);
  assert.equal(r.department, 'Electronics');
  assert.equal(r.subcategory, 'TV & Home Theater');
});

t('Sex Toys (novelty root) → Fashion > Novelty (or Other) — should NOT be Other Misc', () => {
  const r = resolveTaxonomy({
    displayName: 'Sex Toys',
    labelHint: '',
    postCatIds: [200000532],
    leafCatId: 200000532,
  }, cats);
  assert.equal(r.department, 'Fashion');
  assert.notEqual(r.canonical, 'Other > Misc > General > Sex Toys');
});

t('Unknown root id falls back to Other > Misc', () => {
  const r = resolveTaxonomy({
    displayName: 'Mystery Item',
    labelHint: '',
    postCatIds: [999999999],
    leafCatId: 999999999,
  }, cats);
  assert.equal(r.department, 'Other');
  assert.equal(r.category, 'Misc');
});

t('No category data at all → Other > Misc', () => {
  const r = resolveTaxonomy({
    displayName: 'Mystery',
    labelHint: '',
    postCatIds: [],
    leafCatId: null,
  }, cats);
  assert.equal(r.department, 'Other');
});

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
