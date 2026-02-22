/**
 * parse-osm.mjs
 * Streaming parser for the London Ontario OSM XML export.
 * Extracts nodes that have a `name` tag AND at least one meaningful
 * category tag (amenity, shop, tourism, leisure, historic, etc.)
 * Outputs: ../public/london-pois.json
 *
 * Run with: node scripts/parse-osm.mjs
 */

import { createReadStream } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { createInterface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const XML_FILE = path.join(__dirname, '..', 'london ontario map.xml');
const OUT_DIR = path.join(__dirname, '..', 'public');
const OUT_FILE = path.join(OUT_DIR, 'london-pois.json');

// Category tags we care about — maps OSM tag key → friendly category name
const CATEGORY_MAP = {
    amenity: 'amenity',
    shop: 'shop',
    tourism: 'tourism',
    leisure: 'leisure',
    historic: 'historic',
    sport: 'sport',
    office: 'office',
    healthcare: 'healthcare',
    building: 'building',
    natural: 'natural',
};

// Minimum zoom at which each category shows (used as metadata in JSON, filtering done client-side)
const CATEGORY_PRIORITY = {
    tourism: 1,
    historic: 1,
    amenity: 2,
    leisure: 2,
    shop: 3,
    sport: 3,
    office: 4,
    healthcare: 2,
    building: 5,
    natural: 3,
};

const pois = [];
let currentNode = null;   // { id, lat, lon, tags: {} } being accumulated
let totalNodes = 0;
let namedNodes = 0;

const SELF_CLOSING_RE = /^\s*<node\s[^>]*\/>/;
const OPEN_NODE_RE = /^\s*<node\s/;
const CLOSE_NODE_RE = /^\s*<\/node>/;
const TAG_RE = /^\s*<tag\s+k="([^"]+)"\s+v="([^"]+)"/;

// Extract attribute value from a line
function attr(line, name) {
    const m = line.match(new RegExp(`${name}="([^"]+)"`));
    return m ? m[1] : null;
}

function processNode(node) {
    totalNodes++;
    const { tags } = node;
    if (!tags.name) return;

    // Find a category
    let category = null;
    let type = null;
    for (const key of Object.keys(CATEGORY_MAP)) {
        if (tags[key]) {
            category = CATEGORY_MAP[key];
            type = tags[key];
            break;
        }
    }
    if (!category) return;

    namedNodes++;
    pois.push({
        id: node.id,
        lat: parseFloat(node.lat),
        lon: parseFloat(node.lon),
        name: tags.name,
        type,
        category,
        priority: CATEGORY_PRIORITY[category] ?? 3,
        // Extra useful details when available
        ...(tags['addr:housenumber'] && tags['addr:street'] ? { address: `${tags['addr:housenumber']} ${tags['addr:street']}` } : {}),
        ...(tags.website ? { website: tags.website } : {}),
        ...(tags.phone ? { phone: tags.phone } : {}),
        ...(tags.opening_hours ? { hours: tags.opening_hours } : {}),
    });
}

console.log('🗺️  Parsing London Ontario OSM XML...');
console.log(`📂 Source: ${XML_FILE}`);
console.log('⏳ This may take a minute for the 350 MB file...\n');

const rl = createInterface({
    input: createReadStream(XML_FILE, { encoding: 'utf8' }),
    crlfDelay: Infinity,
});

for await (const line of rl) {
    // Self-closing node: <node id="..." lat="..." lon="..." ... />
    if (SELF_CLOSING_RE.test(line)) {
        // No tags, skip (can't have name)
        totalNodes++;
        continue;
    }

    // Opening node tag (multi-line)
    if (OPEN_NODE_RE.test(line) && !SELF_CLOSING_RE.test(line)) {
        currentNode = {
            id: attr(line, 'id'),
            lat: attr(line, 'lat'),
            lon: attr(line, 'lon'),
            tags: {},
        };
        continue;
    }

    // Tag inside a node
    if (currentNode && TAG_RE.test(line)) {
        const m = line.match(TAG_RE);
        if (m) currentNode.tags[m[1]] = m[2];
        continue;
    }

    // Closing node tag
    if (currentNode && CLOSE_NODE_RE.test(line)) {
        processNode(currentNode);
        currentNode = null;
        // Progress every 500k nodes
        if (totalNodes % 500000 === 0) {
            process.stdout.write(`  Processed ${(totalNodes / 1000).toFixed(0)}k nodes, found ${namedNodes} POIs so far...\r`);
        }
        continue;
    }
}

console.log(`\n✅ Done. Scanned ${totalNodes.toLocaleString()} nodes, extracted ${pois.length.toLocaleString()} named POIs.`);

// Sort by priority (most important first)
pois.sort((a, b) => a.priority - b.priority);

// Ensure output dir exists
await mkdir(OUT_DIR, { recursive: true });
await writeFile(OUT_FILE, JSON.stringify(pois));

const fileSizeKB = (JSON.stringify(pois).length / 1024).toFixed(1);
console.log(`📦 Output: ${OUT_FILE} (${fileSizeKB} KB, ${pois.length} POIs)`);

// Summary by category
const byCat = {};
for (const p of pois) {
    byCat[p.category] = (byCat[p.category] || 0) + 1;
}
console.log('\n📊 POI breakdown by category:');
for (const [cat, count] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${cat.padEnd(12)} : ${count.toLocaleString()}`);
}
