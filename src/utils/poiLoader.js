const poiModules = import.meta.glob('../data/pois/**/*.json', {
  eager: true,
  import: 'default',
});

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.pois)) return value.pois;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function normalizePoi(rawPoi) {
  if (!rawPoi) return null;

  const lat = Number(rawPoi.lat);
  const lng = Number(rawPoi.lng ?? rawPoi.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    ...rawPoi,
    lat,
    lng,
    id: rawPoi.id || `${rawPoi.name || 'poi'}-${lat.toFixed(5)}-${lng.toFixed(5)}`,
  };
}

export function loadPoisFromFolder() {
  const combined = Object.values(poiModules)
    .flatMap(asArray)
    .map(normalizePoi)
    .filter(Boolean);

  return combined;
}
