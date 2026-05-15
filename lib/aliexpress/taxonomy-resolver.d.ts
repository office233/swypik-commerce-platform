// Type declarations for the AliExpress taxonomy resolver.
export interface AeCategoryNode {
  id: number;
  parentId: number | null;
  name: string;
  nameRo: string;
  level: number;
}

export interface ResolveTaxonomyInput {
  displayName?: string;
  labelHint?: string;
  postCatIds?: Array<number | string>;
  leafCatId?: number | string | null;
  aeCategoryId?: number | string | null;
}

export interface ResolvedTaxonomy {
  department: string;
  category: string;
  subcategory: string;
  leaf: string;
  canonical: string;
  slug: string;
  confidence: number;
  reason: string;
  aeCategoryId: number | null;
  aeRootCategoryId: number | null;
  aeRootCategoryName: string | null;
}

export interface RootMapEntry {
  department: string;
  defaultCategory: string;
}

export const AE_ROOT_TO_DEPARTMENT: Readonly<Record<number, RootMapEntry>>;

export function decodeDisplayName(s: string): string;
export function slugify(s: string): string;
export function detectGender(labelHint: string): 'Men' | 'Women' | 'Kids' | null;
export function walkChain(leafId: number | string, categoriesById: Map<number, AeCategoryNode>): AeCategoryNode[];
export function resolveTaxonomy(
  input: ResolveTaxonomyInput,
  categoriesById: Map<number, AeCategoryNode>
): ResolvedTaxonomy;
export function categoriesFromRows(rows: Array<Record<string, unknown>>): Map<number, AeCategoryNode>;
export function loadCategories(pool: { query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }> }): Promise<Map<number, AeCategoryNode>>;
