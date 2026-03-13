// ── Physical Product Constants ───────────────────────────────────────

export const SHIPPING_REGIONS = [
  'US',
  'UK',
  'EU',
  'Asia-Pacific',
  'Middle East',
  'Africa',
  'South America',
  'Oceania',
  'Other',
] as const;

export type ShippingRegion = (typeof SHIPPING_REGIONS)[number];

export function isValidShippingRegion(r: string): r is ShippingRegion {
  return (SHIPPING_REGIONS as readonly string[]).includes(r);
}
