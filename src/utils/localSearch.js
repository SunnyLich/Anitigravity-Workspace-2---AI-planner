import { normalizeLocation, dedupeLocations, locationSearchText } from './locationModel';

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s,.-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function buildEntry(location, sourcePriority = 1) {
  const label = location.name || 'Unnamed location';
  const searchableText = `${label} ${location.note || ''}`.toLowerCase();
  const tokens = tokenize(searchableText);

  return {
    location,
    label,
    searchableText,
    tokens,
    sourcePriority,
  };
}

export function buildLocalSearchIndex({ pois = [], customNodes = [] }) {
  const poiEntries = pois
    .map((poi) => normalizeLocation({ ...poi, lng: poi.lon }, 'poi'))
    .filter(Boolean)
    .map((location) => buildEntry(location, 1));

  const customEntries = customNodes
    .filter(Boolean)
    .map((node) => buildEntry(node, 2));

  return [...customEntries, ...poiEntries];
}

function scoreEntry(entry, queryTokens, rawQuery) {
  let score = 0;

  if (entry.searchableText === rawQuery) score += 60;
  if (entry.label.toLowerCase() === rawQuery) score += 50;
  if (entry.label.toLowerCase().startsWith(rawQuery)) score += 30;
  if (entry.searchableText.includes(rawQuery)) score += 20;

  for (const token of queryTokens) {
    if (entry.tokens.includes(token)) score += 12;
    if (entry.tokens.some((entryToken) => entryToken.startsWith(token))) score += 6;
    if (entry.searchableText.includes(token)) score += 2;
  }

  score += entry.sourcePriority * 4;

  return score;
}

export function searchLocalIndex(index, query, limit = 8) {
  const normalizedQuery = String(query || '').toLowerCase().trim();
  if (!normalizedQuery) return [];

  const queryTokens = tokenize(normalizedQuery);

  const scored = index
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, queryTokens, normalizedQuery),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit * 2)
    .map((item) => item.entry.location);

  return dedupeLocations(scored).slice(0, limit);
}

export function matchesLondonHint(location) {
  const text = locationSearchText(location);
  return text.includes('london') || text.includes('ontario') || text.includes('on,');
}
