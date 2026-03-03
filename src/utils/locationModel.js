const DEFAULT_OPENING_HOURS = { start: '09:00', end: '18:00' };

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildId(source, fallback = 'loc') {
  if (fallback) {
    const value = String(fallback);
    if (value.startsWith(`${source}-`)) return value;
    return `${source}-${value}`;
  }
  return `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeLocation(raw, source = 'external') {
  if (!raw) return null;

  const lat = toNumber(raw.lat);
  const lng = toNumber(raw.lng ?? raw.lon);

  if (lat === null || lng === null) return null;

  const name = (raw.name || raw.display_name || 'Unnamed location').trim();
  const fallbackAddress = String(raw.display_name || '')
    .split(',')
    .slice(1)
    .map(part => part.trim())
    .filter(Boolean)
    .join(', ');
  const address = (raw.address || fallbackAddress || '').trim();
  const id = raw.id ? buildId(source, raw.id) : buildId(source);

  return {
    id,
    name,
    address,
    lat,
    lng,
    source,
    note: raw.note || '',
    openingHours: raw.openingHours || DEFAULT_OPENING_HOURS,
    duration: Number.isFinite(raw.duration) ? raw.duration : 60,
  };
}

export function createCustomLocation({ name, lat, lng, note = '' }) {
  return normalizeLocation(
    {
      id: Date.now(),
      name: (name || 'Custom Pin').trim(),
      lat,
      lng,
      note,
      duration: 30,
      openingHours: DEFAULT_OPENING_HOURS,
    },
    'custom'
  );
}

export function locationSearchText(location) {
  return `${location.name} ${location.address || ''} ${location.note || ''}`.toLowerCase();
}

export function dedupeLocations(locations) {
  const seen = new Set();
  const output = [];

  for (const location of locations) {
    const key = `${location.name.toLowerCase()}|${location.lat.toFixed(5)}|${location.lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(location);
  }

  return output;
}
