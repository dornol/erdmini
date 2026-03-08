/**
 * Determine whether a drag has exceeded the screen-pixel threshold.
 * Uses screen pixels (not world coords) so threshold is consistent regardless of zoom level.
 */
export function hasDragExceededThreshold(
  screenDx: number,
  screenDy: number,
  threshold = 5,
): boolean {
  return Math.abs(screenDx) > threshold || Math.abs(screenDy) > threshold;
}
