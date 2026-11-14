export const DOMAIN_LENGTH_RANGE = [1, 65535] as const;
export const DOMAIN_SCALE_RANGE = [0, 30] as const;

export function parseDomainDimension(value: unknown, [min, max]: readonly [number, number]): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}
