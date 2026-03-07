const DEFAULT_OPENING_HOURS = { start: '09:00', end: '18:00' };
const DEFAULT_VISIT_PRIORITY = 1;

const TIME_RANGE_REGEX = /([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)/;

function isValidOpeningHours(value) {
  if (!value || typeof value !== 'object') return false;
  const start = String(value.start || '').trim();
  const end = String(value.end || '').trim();
  return TIME_RANGE_REGEX.test(`${start}-${end}`);
}

function parseOpeningHoursText(text) {
  const normalized = String(text || '').trim();
  if (!normalized) return null;

  if (/\b(closed|off)\b/i.test(normalized)) {
    return null;
  }

  const match = normalized.match(TIME_RANGE_REGEX);
  if (!match) return null;

  const [, startHour, startMinute, endHour, endMinute] = match;
  return {
    start: `${startHour}:${startMinute}`,
    end: `${endHour}:${endMinute}`,
  };
}

function resolveOpeningHours(raw) {
  if (isValidOpeningHours(raw?.openingHours)) {
    return raw.openingHours;
  }

  const parsedFromText = parseOpeningHoursText(raw?.hours || raw?.opening_hours || raw?.openingHoursText);
  if (parsedFromText) {
    return parsedFromText;
  }

  return DEFAULT_OPENING_HOURS;
}

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

function clampPriority(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_VISIT_PRIORITY;
  return Math.min(5, Math.max(1, Math.round(number)));
}

function resolvePriority(raw, source) {
  if (Number.isFinite(Number(raw?.userPriority))) {
    return clampPriority(raw.userPriority);
  }

  // POI source data may already contain a category-level "priority" field.
  // For trip preference scoring we keep a user-facing default unless explicitly set.
  if (source === 'poi') {
    return DEFAULT_VISIT_PRIORITY;
  }

  if (Number.isFinite(Number(raw?.priority))) {
    return clampPriority(raw.priority);
  }

  return DEFAULT_VISIT_PRIORITY;
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
  const openingHoursText = String(raw.hours || raw.opening_hours || raw.openingHoursText || '').trim();
  const priority = resolvePriority(raw, source);

  return {
    id,
    name,
    address,
    lat,
    lng,
    importance: Number.isFinite(Number(raw.importance)) ? Number(raw.importance) : 0,
    source,
    note: raw.note || '',
    priority,
    userPriority: priority,
    openingHours: resolveOpeningHours(raw),
    openingHoursText,
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
