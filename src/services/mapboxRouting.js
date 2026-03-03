const MAPBOX_PROFILE_BY_METHOD = {
  walk: 'walking',
  car: 'driving',
  transit: 'driving-traffic',
};

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistanceKm(a, b) {
  const earthRadiusKm = 6371;
  const latDelta = toRadians(b.lat - a.lat);
  const lngDelta = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) * Math.sin(lngDelta / 2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function buildMockRoute(origin, destination, travelMethod) {
  const speedKmHByMethod = {
    walk: 5,
    car: 42,
    transit: 24,
  };

  const speedKmH = speedKmHByMethod[travelMethod] || 5;
  const directKm = haversineDistanceKm(origin, destination);
  const routeKm = directKm * 1.28;
  const durationMinutes = Math.max(1, Math.round((routeKm / speedKmH) * 60));

  const midLat = (origin.lat + destination.lat) / 2 + 0.0045;
  const midLng = (origin.lng + destination.lng) / 2 - 0.003;

  return {
    provider: 'mock',
    profile: MAPBOX_PROFILE_BY_METHOD[travelMethod] || 'walking',
    distanceKm: Number(routeKm.toFixed(2)),
    durationMinutes,
    geometry: [
      [origin.lat, origin.lng],
      [midLat, midLng],
      [destination.lat, destination.lng],
    ],
    legs: [
      {
        summary: 'Mock route segment',
        durationMinutes,
        distanceKm: Number(routeKm.toFixed(2)),
      },
    ],
  };
}

function normalizeMapboxRoute(route, travelMethod) {
  return {
    provider: 'mapbox',
    profile: MAPBOX_PROFILE_BY_METHOD[travelMethod] || 'walking',
    distanceKm: Number((route.distance / 1000).toFixed(2)),
    durationMinutes: Math.max(1, Math.round(route.duration / 60)),
    geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    legs: (route.legs || []).map((leg, index) => ({
      summary: leg.summary || `Leg ${index + 1}`,
      durationMinutes: Math.max(1, Math.round(leg.duration / 60)),
      distanceKm: Number((leg.distance / 1000).toFixed(2)),
    })),
  };
}

export async function getRouteEstimate({ origin, destination, travelMethod = 'walk' }) {
  if (!origin || !destination) {
    throw new Error('Origin and destination are required for route estimation.');
  }

  const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
  const forceMock = import.meta.env.VITE_USE_MOCK_ROUTING !== 'false';

  if (forceMock || !mapboxToken) {
    return buildMockRoute(origin, destination, travelMethod);
  }

  const profile = MAPBOX_PROFILE_BY_METHOD[travelMethod] || 'walking';
  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;

  const params = new URLSearchParams({
    geometries: 'geojson',
    overview: 'full',
    steps: 'true',
    alternatives: 'false',
    access_token: mapboxToken,
  });

  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?${params.toString()}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Mapbox routing failed (${response.status}).`);
  }

  const data = await response.json();
  const firstRoute = data?.routes?.[0];

  if (!firstRoute || !firstRoute.geometry?.coordinates?.length) {
    throw new Error('Mapbox returned no valid route.');
  }

  return normalizeMapboxRoute(firstRoute, travelMethod);
}
