const MAPBOX_PROFILE_BY_METHOD = {
  walk: 'walking',
  car: 'driving',
  transit: 'driving-traffic',
};

/**
 * Normalized route estimate contract used across UI and provider adapters.
 * @typedef {Object} RouteEstimate
 * @property {string} provider
 * @property {'walk'|'car'|'transit'} travelMethod
 * @property {string} profile
 * @property {number} distanceKm
 * @property {number} durationMinutes
 * @property {Array<[number, number]>} geometry - [lat, lng] points
 * @property {Array<{summary: string, durationMinutes: number, distanceKm: number}>} legs
 * @property {boolean} isScheduleAware
 * @property {boolean} isMock
 * @property {Array<{mode: string, from?: string, to?: string, durationMinutes: number}>} transitLegs
 */

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

  return normalizeRouteEstimate({
    provider: 'mock',
    travelMethod,
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
    isScheduleAware: false,
    isMock: true,
  });
}

function normalizeMapboxRoute(route, travelMethod) {
  return normalizeRouteEstimate({
    provider: 'mapbox',
    travelMethod,
    profile: MAPBOX_PROFILE_BY_METHOD[travelMethod] || 'walking',
    distanceKm: Number((route.distance / 1000).toFixed(2)),
    durationMinutes: Math.max(1, Math.round(route.duration / 60)),
    geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    legs: (route.legs || []).map((leg, index) => ({
      summary: leg.summary || `Leg ${index + 1}`,
      durationMinutes: Math.max(1, Math.round(leg.duration / 60)),
      distanceKm: Number((leg.distance / 1000).toFixed(2)),
    })),
    isScheduleAware: false,
    isMock: false,
  });
}

/**
 * @param {Partial<RouteEstimate>} raw
 * @returns {RouteEstimate}
 */
function normalizeRouteEstimate(raw) {
  const travelMethod = ['walk', 'car', 'transit'].includes(raw?.travelMethod)
    ? raw.travelMethod
    : 'walk';

  const profile = String(raw?.profile || MAPBOX_PROFILE_BY_METHOD[travelMethod] || 'walking');
  const distanceKm = Number.isFinite(Number(raw?.distanceKm)) ? Number(raw.distanceKm) : 0;
  const durationMinutes = Math.max(1, Math.round(Number(raw?.durationMinutes) || 1));

  const geometry = Array.isArray(raw?.geometry)
    ? raw.geometry
      .filter((point) => Array.isArray(point) && point.length === 2)
      .map(([lat, lng]) => [Number(lat), Number(lng)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng))
    : [];

  const legs = Array.isArray(raw?.legs)
    ? raw.legs.map((leg, index) => ({
      summary: String(leg?.summary || `Leg ${index + 1}`),
      durationMinutes: Math.max(1, Math.round(Number(leg?.durationMinutes) || 1)),
      distanceKm: Number.isFinite(Number(leg?.distanceKm)) ? Number(leg.distanceKm) : 0,
    }))
    : [];

  const transitLegs = Array.isArray(raw?.transitLegs)
    ? raw.transitLegs
      .map((leg) => ({
        mode: String(leg?.mode || 'unknown'),
        from: leg?.from ? String(leg.from) : undefined,
        to: leg?.to ? String(leg.to) : undefined,
        durationMinutes: Math.max(1, Math.round(Number(leg?.durationMinutes) || 1)),
      }))
    : [];

  return {
    provider: String(raw?.provider || 'unknown'),
    travelMethod,
    profile,
    distanceKm: Number(distanceKm.toFixed(2)),
    durationMinutes,
    geometry,
    legs,
    isScheduleAware: Boolean(raw?.isScheduleAware),
    isMock: Boolean(raw?.isMock),
    transitLegs,
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
