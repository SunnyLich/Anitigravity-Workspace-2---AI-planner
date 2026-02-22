/**
 * Nominatim Geocoding Service
 * Documentation: https://nominatim.org/release-docs/latest/api/Search/
 */

export const searchLocations = async (query) => {
    if (!query || query.length < 3) return [];

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;

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
            importance: item.importance
        }));
    } catch (error) {
        console.error('Geocoding error:', error);
        return [];
    }
};
