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

export const searchLocations = async (query, options = {}) => {
    if (!query || query.length < 3) return [];

    const limit = options.limit || 5;
    const countryCode = options.countryCode || 'ca';
    const viewbox = options.viewbox || LONDON_VIEWBOX;

    const params = new URLSearchParams({
        format: 'json',
        q: query,
        limit: String(limit),
        countrycodes: countryCode,
        bounded: '1',
        viewbox: `${viewbox.left},${viewbox.top},${viewbox.right},${viewbox.bottom}`,
    });

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
