/**
 * Automatic style selection — picks the best N styles for an order based on
 * product category. Called at order creation time when the user has not
 * manually chosen styles.
 *
 * Rules match the product brief spec:
 *   food       → Lifestyle, Colored Studio, Clean White
 *   jewellery  → Dark Luxury, Clean White, With Model
 *   garment    → Lifestyle, With Model, Outdoor
 *   skincare   → Clean White, Colored Studio, Dark Luxury
 *   candle     → Dark Luxury, Lifestyle, Outdoor
 *   bags       → Dark Luxury, With Model, Colored Studio
 *   other      → Clean White, Lifestyle, Colored Studio
 */

const CATEGORY_STYLE_PRIORITY: Record<string, string[]> = {
  cat_food:       ['style_lifestyle', 'style_studio',     'style_clean_white'],
  cat_jewellery:  ['style_gradient',  'style_clean_white','style_with_model'],
  cat_garment:    ['style_lifestyle', 'style_with_model', 'style_outdoor'],
  cat_skincare:   ['style_clean_white','style_studio',    'style_gradient'],
  cat_candle:     ['style_gradient',  'style_lifestyle',  'style_outdoor'],
  cat_bag:        ['style_gradient',  'style_with_model', 'style_studio'],
};

const DEFAULT_STYLES = ['style_clean_white', 'style_lifestyle', 'style_studio'];

/**
 * Returns `count` style IDs ordered by best-fit for the given category.
 * Never returns duplicates. Always returns exactly `count` entries.
 */
export function selectStylesForOrder(
  category: string | null | undefined,
  count: number,
): string[] {
  const normalised = category?.startsWith('cat_') ? category : category ? `cat_${category}` : null;
  const priority = (normalised && CATEGORY_STYLE_PRIORITY[normalised]) ?? DEFAULT_STYLES;

  const result: string[] = [];
  const seen = new Set<string>();

  // Fill from priority list first
  for (const s of priority) {
    if (result.length >= count) break;
    if (!seen.has(s)) { result.push(s); seen.add(s); }
  }

  // Pad with fallback pool if priority list is shorter than count
  const fallback = [
    'style_lifestyle', 'style_gradient', 'style_outdoor',
    'style_studio', 'style_festive', 'style_with_model', 'style_clean_white',
  ];
  for (const s of fallback) {
    if (result.length >= count) break;
    if (!seen.has(s)) { result.push(s); seen.add(s); }
  }

  return result.slice(0, count);
}
