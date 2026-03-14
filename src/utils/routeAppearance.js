export const DEFAULT_ROUTE_LAYER_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#f97316'];

export function getDefaultRouteColor(index = 0) {
  const paletteIndex = Math.abs(Math.round(Number(index) || 0)) % DEFAULT_ROUTE_LAYER_COLORS.length;
  return DEFAULT_ROUTE_LAYER_COLORS[paletteIndex];
}