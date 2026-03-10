const MAPBOX_PROFILE_BY_METHOD = {
  walk: 'walking',
  car: 'driving',
  transit: 'driving-traffic',
};

const OTP_DEFAULT_TIMEOUT_MS = 12000;

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
 * @property {boolean} unavailable
 * @property {string} notice
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

function buildTransitNotice(reason) {
  const notices = {
    'mock-config-enabled': 'Using mock transit estimates (mock mode enabled).',
    'otp-not-configured': 'Transit provider is not configured. Showing fallback estimate.',
    'otp-timeout': 'Transit provider timed out. Showing fallback estimate.',
    'otp-http-error': 'Transit provider returned an error. Showing fallback estimate.',
    'otp-no-itinerary': 'No transit itinerary was returned. Showing fallback estimate.',
    'otp-request-failed': 'Transit provider is unavailable. Showing fallback estimate.',
  };

  return notices[reason] || 'Transit provider unavailable. Showing fallback estimate.';
}

function buildMockTransitRoute(origin, destination, options = {}) {
  const fallbackReason = String(options.reason || 'mock-config-enabled');
  const directKm = haversineDistanceKm(origin, destination);
  const walkToStopMinutes = Math.max(4, Math.round(directKm * 6));
  const rideMinutes = Math.max(6, Math.round(directKm * 2.4));
  const walkFromStopMinutes = Math.max(3, Math.round(directKm * 4));
  const durationMinutes = walkToStopMinutes + rideMinutes + walkFromStopMinutes;

  const startLat = origin.lat;
  const startLng = origin.lng;
  const midLat = (origin.lat + destination.lat) / 2;
  const midLng = (origin.lng + destination.lng) / 2;
  const endLat = destination.lat;
  const endLng = destination.lng;

  return normalizeRouteEstimate({
    provider: 'mock-transit',
    travelMethod: 'transit',
    profile: 'otp-transit',
    distanceKm: Number((directKm * 1.35).toFixed(2)),
    durationMinutes,
    geometry: [
      [startLat, startLng],
      [midLat, midLng],
      [endLat, endLng],
    ],
    legs: [
      {
        summary: 'Walk to stop',
        durationMinutes: walkToStopMinutes,
        distanceKm: Number((directKm * 0.2).toFixed(2)),
      },
      {
        summary: 'Transit ride',
        durationMinutes: rideMinutes,
        distanceKm: Number((directKm * 0.95).toFixed(2)),
      },
      {
        summary: 'Walk to destination',
        durationMinutes: walkFromStopMinutes,
        distanceKm: Number((directKm * 0.2).toFixed(2)),
      },
    ],
    transitLegs: [
      { mode: 'WALK', from: 'Origin', to: 'Boarding stop', durationMinutes: walkToStopMinutes },
      { mode: 'BUS', from: 'Boarding stop', to: 'Alighting stop', durationMinutes: rideMinutes },
      { mode: 'WALK', from: 'Alighting stop', to: 'Destination', durationMinutes: walkFromStopMinutes },
    ],
    isScheduleAware: false,
    isMock: true,
    unavailable: Boolean(options.unavailable),
    notice: buildTransitNotice(fallbackReason),
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

function extractOtpLegMode(leg) {
  if (leg?.transitLeg) {
    return String(leg?.route?.gtfsId || leg?.route?.shortName || leg?.mode || 'TRANSIT');
  }
  return String(leg?.mode || 'WALK').toUpperCase();
}

function normalizeOtpItinerary(itinerary) {
  const legs = Array.isArray(itinerary?.legs) ? itinerary.legs : [];
  const geometry = legs.flatMap((leg) => {
    const from = leg?.from;
    const to = leg?.to;
    const points = [];

    if (Number.isFinite(Number(from?.lat)) && Number.isFinite(Number(from?.lon))) {
      points.push([Number(from.lat), Number(from.lon)]);
    }

    if (Number.isFinite(Number(to?.lat)) && Number.isFinite(Number(to?.lon))) {
      points.push([Number(to.lat), Number(to.lon)]);
    }

    return points;
  });

  const legSummaries = legs.map((leg, index) => {
    const fromName = String(leg?.from?.name || 'Start').trim();
    const toName = String(leg?.to?.name || 'End').trim();
    const mode = String(leg?.mode || (leg?.transitLeg ? 'TRANSIT' : 'WALK')).toUpperCase();

    return {
      summary: `${mode}: ${fromName} -> ${toName}`,
      durationMinutes: Math.max(1, Math.round(Number(leg?.duration || 0) / 60)),
      distanceKm: Number((Number(leg?.distance || 0) / 1000).toFixed(2)),
    };
  });

  const transitLegs = legs.map((leg) => ({
    mode: extractOtpLegMode(leg),
    from: leg?.from?.name ? String(leg.from.name) : undefined,
    to: leg?.to?.name ? String(leg.to.name) : undefined,
    durationMinutes: Math.max(1, Math.round(Number(leg?.duration || 0) / 60)),
  }));

  return normalizeRouteEstimate({
    provider: 'otp',
    travelMethod: 'transit',
    profile: 'otp-transit',
    distanceKm: Number((Number(itinerary?.walkDistance || 0) / 1000).toFixed(2)),
    durationMinutes: Math.max(1, Math.round(Number(itinerary?.duration || 0) / 60)),
    geometry,
    legs: legSummaries,
    transitLegs,
    isScheduleAware: true,
    isMock: false,
  });
}

export async function getTransitRouteEstimate({ origin, destination, dateTime = new Date().toISOString() }) {
  if (!origin || !destination) {
    throw new Error('Origin and destination are required for transit estimation.');
  }

  const forceMockTransit = import.meta.env.VITE_USE_MOCK_TRANSIT !== 'false';
  const otpBaseUrl = String(import.meta.env.VITE_OTP_BASE_URL || '').trim();
  const timeoutMs = Math.max(2000, Number(import.meta.env.VITE_OTP_TIMEOUT_MS || OTP_DEFAULT_TIMEOUT_MS));

  if (forceMockTransit) {
    return buildMockTransitRoute(origin, destination, {
      reason: 'mock-config-enabled',
      unavailable: false,
    });
  }

  if (!otpBaseUrl) {
    return buildMockTransitRoute(origin, destination, {
      reason: 'otp-not-configured',
      unavailable: true,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const params = new URLSearchParams({
    fromPlace: `${origin.lat},${origin.lng}`,
    toPlace: `${destination.lat},${destination.lng}`,
    mode: 'WALK,TRANSIT',
    numItineraries: '1',
  });

  if (dateTime) {
    const parsed = new Date(dateTime);
    if (!Number.isNaN(parsed.getTime())) {
      params.set('date', parsed.toISOString().slice(0, 10));
      params.set('time', parsed.toISOString().slice(11, 19));
    }
  }

  const url = `${otpBaseUrl.replace(/\/$/, '')}/routers/default/plan?${params.toString()}`;

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`otp-http-error:${response.status}`);
    }

    const data = await response.json();
    const itinerary = data?.plan?.itineraries?.[0];

    if (!itinerary) {
      throw new Error('otp-no-itinerary');
    }

    return normalizeOtpItinerary(itinerary);
  } catch (error) {
    console.warn('OTP transit routing unavailable, using mock transit fallback:', error);
    let fallbackReason = 'otp-request-failed';
    if (error?.name === 'AbortError') {
      fallbackReason = 'otp-timeout';
    } else if (String(error?.message || '').startsWith('otp-http-error')) {
      fallbackReason = 'otp-http-error';
    } else if (String(error?.message || '').includes('otp-no-itinerary')) {
      fallbackReason = 'otp-no-itinerary';
    }

    return buildMockTransitRoute(origin, destination, {
      reason: fallbackReason,
      unavailable: true,
    });
  } finally {
    clearTimeout(timer);
  }
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
    unavailable: Boolean(raw?.unavailable),
    notice: String(raw?.notice || '').trim(),
    transitLegs,
  };
}

export async function getRouteEstimate({ origin, destination, travelMethod = 'walk', dateTime }) {
  if (!origin || !destination) {
    throw new Error('Origin and destination are required for route estimation.');
  }

  if (travelMethod === 'transit') {
    return getTransitRouteEstimate({ origin, destination, dateTime });
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
