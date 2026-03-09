/**
 * Nominatim Geocoding Service
 * Documentation: https://nominatim.org/release-docs/latest/api/Search/
 */

const LONDON_VIEWBOX = {
    left: -81.62,
    top: 43.20,
    right: -80.96,
    bottom: 42.74,
};

const REVERSE_GEOCODE_MIN_INTERVAL_MS = 1100;
const reverseGeocodeCache = new Map();
let lastReverseGeocodeAt = 0;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function reverseCacheKey(lat, lng) {
    return `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
}

async function throttleReverseGeocode() {
    const now = Date.now();
    const elapsed = now - lastReverseGeocodeAt;

    if (elapsed < REVERSE_GEOCODE_MIN_INTERVAL_MS) {
        await sleep(REVERSE_GEOCODE_MIN_INTERVAL_MS - elapsed);
    }

    lastReverseGeocodeAt = Date.now();
}

export const searchLocations = async (query, options = {}) => {
    if (!query || query.length < 3) return [];

    const limit = options.limit || 5;
    const countryCode = options.countryCode ?? 'ca';
    const viewbox = options.viewbox ?? LONDON_VIEWBOX;
    const bounded = options.bounded ?? true;

    const params = new URLSearchParams({
        format: 'json',
        q: query,
        limit: String(limit),
    });

    if (countryCode) {
        params.set('countrycodes', countryCode);
    }

    if (bounded && viewbox) {
        params.set('bounded', '1');
        params.set('viewbox', `${viewbox.left},${viewbox.top},${viewbox.right},${viewbox.bottom}`);
    }

    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

    try {
        const response = await fetch(url, {
            headers: {
                'Accept-Language': 'en',
                'User-Agent': 'AI-Trip-Optimizer-MVP' // Important for Nominatim policy
            }
        });

        if (!response.ok) throw new Error('Network response was not ok');

        const data = await response.json();

        return data.map(item => ({
            id: item.place_id,
            name: item.display_name,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            importance: item.importance,
            source: 'nominatim',
        }));
    } catch (error) {
        console.error('Geocoding error:', error);
        return [];
    }
};

export const reverseGeocodeLocation = async ({ lat, lng }) => {
    const latValue = Number(lat);
    const lngValue = Number(lng);

    if (!Number.isFinite(latValue) || !Number.isFinite(lngValue)) {
        return null;
    }

    const cacheKey = reverseCacheKey(latValue, lngValue);
    if (reverseGeocodeCache.has(cacheKey)) {
        return reverseGeocodeCache.get(cacheKey);
    }

    await throttleReverseGeocode();

    const params = new URLSearchParams({
        format: 'jsonv2',
        lat: String(latValue),
        lon: String(lngValue),
        addressdetails: '1',
        zoom: '18',
    });

    const url = `https://nominatim.openstreetmap.org/reverse?${params.toString()}`;

    try {
        const response = await fetch(url, {
            headers: {
                'Accept-Language': 'en',
            }
        });

        if (!response.ok) throw new Error('Reverse geocode request failed');

        const data = await response.json();
        const result = {
            address: String(data?.display_name || '').trim(),
            addressParts: data?.address || null,
            source: 'nominatim_reverse',
        };

        reverseGeocodeCache.set(cacheKey, result);
        return result;
    } catch (error) {
        console.warn('Reverse geocoding error:', error);
        return null;
    }
};
