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
  const nameText = String(label || '').toLowerCase();
  const addressText = String(location.address || '').toLowerCase();
  const noteText = String(location.note || '').toLowerCase();
  const searchableText = `${nameText} ${addressText} ${noteText}`;
  const tokens = tokenize(searchableText);

  return {
    location,
    label,
    nameText,
    addressText,
    noteText,
    searchableText,
    tokens,
    sourcePriority,
  };
}

function buildBigrams(text) {
  const value = String(text || '').trim();
  if (value.length < 2) return [];

  const output = [];
  for (let i = 0; i < value.length - 1; i++) {
    output.push(value.slice(i, i + 2));
  }

  return output;
}

function diceCoefficient(leftText, rightText) {
  const left = buildBigrams(leftText);
  const right = buildBigrams(rightText);
  if (left.length === 0 || right.length === 0) return 0;

  const leftCounts = new Map();
  for (let i = 0; i < left.length; i++) {
    const token = left[i];
    leftCounts.set(token, (leftCounts.get(token) || 0) + 1);
  }

  let overlap = 0;
  for (let i = 0; i < right.length; i++) {
    const token = right[i];
    const count = leftCounts.get(token) || 0;
    if (count > 0) {
      overlap += 1;
      leftCounts.set(token, count - 1);
    }
  }

  return (2 * overlap) / (left.length + right.length);
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

  if (entry.searchableText === rawQuery) score += 140;
  if (entry.nameText === rawQuery) score += 120;
  if (entry.nameText.startsWith(rawQuery)) score += 80;
  if (entry.addressText.startsWith(rawQuery)) score += 34;
  if (entry.searchableText.includes(rawQuery)) score += 20;

  for (const token of queryTokens) {
    if (!token) continue;

    if (entry.nameText.includes(token)) score += 30;
    if (entry.addressText.includes(token)) score += 12;
    if (entry.noteText.includes(token)) score += 8;

    if (entry.tokens.includes(token)) score += 10;
    if (entry.tokens.some((entryToken) => entryToken.startsWith(token))) score += 8;

    // Fuzzy token bonus helps recover from small misspellings.
    if (token.length >= 3) {
      let maxSimilarity = 0;
      for (let i = 0; i < entry.tokens.length; i++) {
        const similarity = diceCoefficient(token, entry.tokens[i]);
        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
        }
      }

      if (maxSimilarity >= 0.75) {
        score += maxSimilarity * 18;
      }
    }
  }

  if (score <= 0) return 0;

  score += entry.sourcePriority * 1.5;

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
