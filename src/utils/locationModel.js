const DEFAULT_OPENING_HOURS = { start: '09:00', end: '18:00' };
const DEFAULT_VISIT_PRIORITY = 1;
const LEGACY_DAY_ALIASES = {
  mo: 'mo',
  mon: 'mo',
  monday: 'mo',
  tu: 'tu',
  tue: 'tu',
  tues: 'tu',
  tuesday: 'tu',
  we: 'we',
  wed: 'we',
  weds: 'we',
  wednesday: 'we',
  th: 'th',
  thu: 'th',
  thur: 'th',
  thurs: 'th',
  thursday: 'th',
  fr: 'fr',
  fri: 'fr',
  friday: 'fr',
  sa: 'sa',
  sat: 'sa',
  saturday: 'sa',
  su: 'su',
  sun: 'su',
  sunday: 'su',
};

const TIME_TOKEN_REGEX = '(?:[01]\\d|2[0-3]):[0-5]\\d|24:00';
const TIME_RANGE_REGEX = new RegExp(`(${TIME_TOKEN_REGEX})\\s*(?:-|\\u2013|to)\\s*(${TIME_TOKEN_REGEX})`, 'i');

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

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

  const [, startTime, endTime] = match;
  return {
    start: startTime,
    end: endTime,
  };
}

function normalizeLegacyDayKey(key) {
  const normalized = String(key || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  return LEGACY_DAY_ALIASES[normalized] || null;
}

function normalizeDayRule(rule) {
  if (isValidOpeningHours(rule)) {
    return {
      start: String(rule.start).trim(),
      end: String(rule.end).trim(),
    };
  }

  const parsedFromText = parseOpeningHoursText(rule);
  if (parsedFromText) return parsedFromText;

  return null;
}

function extractLegacyOpeningRuleMap(value) {
  if (!isPlainObject(value) || isValidOpeningHours(value)) return null;

  const days = {};

  for (const [rawKey, rawRule] of Object.entries(value)) {
    const dayKey = normalizeLegacyDayKey(rawKey);
    if (!dayKey) continue;

    const normalizedRule = normalizeDayRule(rawRule);
    if (normalizedRule) {
      days[dayKey] = normalizedRule;
    }
  }

  return Object.keys(days).length > 0 ? days : null;
}

function resolveOpeningRules(raw) {
  const fromOpeningRules = extractLegacyOpeningRuleMap(raw?.openingRules?.days)
    || extractLegacyOpeningRuleMap(raw?.openingRules);
  if (fromOpeningRules) {
    return { days: fromOpeningRules };
  }

  const fromLegacyOpeningHours = extractLegacyOpeningRuleMap(raw?.openingHours);
  if (fromLegacyOpeningHours) {
    return { days: fromLegacyOpeningHours };
  }

  return null;
}

function deriveOpeningHoursFromRules(openingRules) {
  if (!isPlainObject(openingRules?.days)) return null;

  const priorityOrder = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
  for (const day of priorityOrder) {
    const candidate = normalizeDayRule(openingRules.days[day]);
    if (candidate) return candidate;
  }

  return null;
}

function resolveOpeningHoursAndSource(raw, openingRules) {
  if (isValidOpeningHours(raw?.openingHours)) {
    return {
      openingHours: {
        start: String(raw.openingHours.start).trim(),
        end: String(raw.openingHours.end).trim(),
      },
      openingHoursSource: 'openingHours-object',
    };
  }

  const fromRules = deriveOpeningHoursFromRules(openingRules);
  if (fromRules) {
    return {
      openingHours: fromRules,
      openingHoursSource: 'openingRules-derived',
    };
  }

  const parsedFromText = parseOpeningHoursText(raw?.hours || raw?.opening_hours || raw?.openingHoursText);
  if (parsedFromText) {
    return {
      openingHours: parsedFromText,
      openingHoursSource: 'hours-text',
    };
  }

  return {
    openingHours: DEFAULT_OPENING_HOURS,
    openingHoursSource: 'default-fallback',
  };
}

function buildLocationMetadata(raw, openingRules, openingHoursSource, openingHoursText) {
  const tags = isPlainObject(raw?.tags) ? raw.tags : null;
  const openingRuleCount = isPlainObject(openingRules?.days) ? Object.keys(openingRules.days).length : 0;

  return {
    type: String(raw?.type || tags?.amenity || tags?.tourism || tags?.leisure || '').trim(),
    category: String(raw?.category || '').trim(),
    website: String(raw?.website || tags?.website || '').trim(),
    phone: String(raw?.phone || tags?.phone || '').trim(),
    sourceRecordId: String(raw?.id || '').trim(),
    openingHoursSource,
    openingRulesDayCount: openingRuleCount,
    hasOpeningHoursText: Boolean(String(openingHoursText || '').trim()),
  };
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

function adaptLegacyLocationShape(rawInput) {
  const raw = isPlainObject(rawInput) ? { ...rawInput } : rawInput;
  if (!raw || typeof raw !== 'object') return raw;

  const legacyOpeningHours = raw.sourceOpeningHours;
  const legacyStart = String(raw.startTime || raw.open || '').trim();
  const legacyEnd = String(raw.endTime || raw.close || '').trim();
  const hasLegacyRange = TIME_RANGE_REGEX.test(`${legacyStart}-${legacyEnd}`);

  if (!raw.openingHours) {
    if (isValidOpeningHours(legacyOpeningHours)) {
      raw.openingHours = {
        start: String(legacyOpeningHours.start).trim(),
        end: String(legacyOpeningHours.end).trim(),
      };
    } else if (hasLegacyRange) {
      raw.openingHours = {
        start: legacyStart,
        end: legacyEnd,
      };
    }
  }

  if (!raw.openingHoursText) {
    raw.openingHoursText = String(raw.sourceOpeningHoursText || raw.hoursText || raw.openingHoursLabel || '').trim();
  }

  if (!Number.isFinite(Number(raw.duration)) && Number.isFinite(Number(raw.visitDurationMinutes))) {
    raw.duration = Number(raw.visitDurationMinutes);
  }

  if (!Number.isFinite(Number(raw.priority)) && Number.isFinite(Number(raw.priorityLevel))) {
    raw.priority = Number(raw.priorityLevel);
  }

  if (!raw.note && typeof raw.description === 'string') {
    raw.note = raw.description;
  }

  return raw;
}

export function normalizeLocation(raw, source = 'external') {
  if (!raw) return null;

  const adaptedRaw = adaptLegacyLocationShape(raw);

  const lat = toNumber(adaptedRaw.lat);
  const lng = toNumber(adaptedRaw.lng ?? adaptedRaw.lon);

  if (lat === null || lng === null) return null;

  const name = (adaptedRaw.name || adaptedRaw.display_name || 'Unnamed location').trim();
  const fallbackAddress = String(adaptedRaw.display_name || '')
    .split(',')
    .slice(1)
    .map(part => part.trim())
    .filter(Boolean)
    .join(', ');
  const address = (adaptedRaw.address || fallbackAddress || '').trim();
  const id = adaptedRaw.id ? buildId(source, adaptedRaw.id) : buildId(source);
  const openingHoursText = String(adaptedRaw.hours || adaptedRaw.opening_hours || adaptedRaw.openingHoursText || '').trim();
  const priority = resolvePriority(adaptedRaw, source);
  const openingRules = resolveOpeningRules(adaptedRaw);
  const openingModel = resolveOpeningHoursAndSource(adaptedRaw, openingRules);
  const metadata = buildLocationMetadata(adaptedRaw, openingRules, openingModel.openingHoursSource, openingHoursText);

  return {
    id,
    name,
    address,
    lat,
    lng,
    importance: Number.isFinite(Number(adaptedRaw.importance)) ? Number(adaptedRaw.importance) : 0,
    source,
    note: adaptedRaw.note || '',
    priority,
    userPriority: priority,
    openingHours: openingModel.openingHours,
    openingRules,
    openingHoursText,
    metadata,
    duration: Number.isFinite(Number(adaptedRaw.duration)) ? Math.max(1, Math.round(Number(adaptedRaw.duration))) : 60,
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
