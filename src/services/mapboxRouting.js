const MAPBOX_PROFILE_BY_METHOD = {
  walk: 'walking',
  car: 'driving',
  transit: 'driving-traffic',
};

const OTP_DEFAULT_TIMEOUT_MS = 12000;
const USE_MOCK_TRANSIT_STORAGE_KEY = 'tripoptimizer.useMockTransit';
const OTP_BASE_URL_STORAGE_KEY = 'tripoptimizer.otpBaseUrl';
const OTP_ENDPOINT_PREFERENCE_CACHE = new Map();
const FALLBACK_OTP_BASE_URL = 'http://localhost:8080/';
const OTP_GRAPHQL_PLAN_QUERY = `query Plan(
  $origin: PlanLabeledLocationInput!
  $destination: PlanLabeledLocationInput!
  $dateTime: PlanDateTimeInput
  $first: Int
  $modes: PlanModesInput
) {
  planConnection(
    origin: $origin
    destination: $destination
    dateTime: $dateTime
    first: $first
    modes: $modes
  ) {
    edges {
      node {
        start
        end
        duration
        numberOfTransfers
        walkTime
        waitingTime
        legs {
          mode
          transitLeg
          headsign
          duration
          distance
          from {
            name
            lat
            lon
            stop {
              gtfsId
            }
          }
          to {
            name
            lat
            lon
            stop {
              gtfsId
            }
          }
          route {
            shortName
            longName
            gtfsId
          }
          legGeometry {
            points
          }
          start {
            scheduledTime
          }
          end {
            scheduledTime
          }
        }
      }
    }
    routingErrors {
      code
      description
    }
  }
}`;

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
 * @property {string} departureTimeIso
 * @property {string} arrivalTimeIso
 * @property {number} transferCount
 * @property {number} walkMinutes
 * @property {number} waitMinutes
 * @property {Array<{mode: string, routeLabel?: string, headsign?: string, from?: string, to?: string, fromStopId?: string, toStopId?: string, startTimeIso?: string, endTimeIso?: string, durationMinutes: number, distanceKm: number, isTransitLeg: boolean}>} transitLegs
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

function getStoredTransitBoolean(key) {
  if (typeof window === 'undefined' || !window.localStorage) return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch (error) {
    console.warn('Could not read transit boolean setting:', error);
  }

  return null;
}

function getStoredTransitString(key) {
  if (typeof window === 'undefined' || !window.localStorage) return '';

  try {
    return String(window.localStorage.getItem(key) || '').trim();
  } catch (error) {
    console.warn('Could not read transit string setting:', error);
  }

  return '';
}

function getTransitRuntimeConfig() {
  const storedUseMockTransit = getStoredTransitBoolean(USE_MOCK_TRANSIT_STORAGE_KEY);
  const storedOtpBaseUrl = getStoredTransitString(OTP_BASE_URL_STORAGE_KEY);
  const defaultOtpBaseUrl = String(import.meta.env.VITE_OTP_BASE_URL || FALLBACK_OTP_BASE_URL).trim();

  return {
    forceMockTransit: storedUseMockTransit ?? (import.meta.env.VITE_USE_MOCK_TRANSIT !== 'false'),
    otpBaseUrl: storedOtpBaseUrl || defaultOtpBaseUrl,
    timeoutMs: Math.max(2000, Number(import.meta.env.VITE_OTP_TIMEOUT_MS || OTP_DEFAULT_TIMEOUT_MS)),
  };
}

function normalizeOtpBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

function getOtpApiBaseCandidates(baseUrl) {
  const normalizedBaseUrl = normalizeOtpBaseUrl(baseUrl);
  if (!normalizedBaseUrl) return [];

  const candidates = normalizedBaseUrl.endsWith('/otp')
    ? [normalizedBaseUrl]
    : [`${normalizedBaseUrl}/otp`, normalizedBaseUrl];

  return [...new Set(candidates.map((candidate) => candidate.replace(/\/+$/, '')).filter(Boolean))];
}

function getOtpEndpointCandidates(baseUrl) {
  const normalizedBaseUrl = normalizeOtpBaseUrl(baseUrl);
  const preferredUrl = OTP_ENDPOINT_PREFERENCE_CACHE.get(normalizedBaseUrl);
  const candidates = [];

  for (const apiBase of getOtpApiBaseCandidates(normalizedBaseUrl)) {
    candidates.push(
      { kind: 'graphql', url: `${apiBase}/routers/default/index/graphql` },
      { kind: 'graphql', url: `${apiBase}/gtfs/v1` },
      { kind: 'rest', url: `${apiBase}/routers/default/plan` },
    );
  }

  const uniqueCandidates = candidates.filter((candidate, index, allCandidates) => (
    allCandidates.findIndex((item) => item.kind === candidate.kind && item.url === candidate.url) === index
  ));

  if (!preferredUrl) {
    return uniqueCandidates;
  }

  const preferredCandidates = uniqueCandidates.filter((candidate) => candidate.url === preferredUrl);
  const remainingCandidates = uniqueCandidates.filter((candidate) => candidate.url !== preferredUrl);
  return [...preferredCandidates, ...remainingCandidates];
}

function rememberOtpEndpointSuccess(baseUrl, endpointUrl) {
  const normalizedBaseUrl = normalizeOtpBaseUrl(baseUrl);
  if (!normalizedBaseUrl || !endpointUrl) return;
  OTP_ENDPOINT_PREFERENCE_CACHE.set(normalizedBaseUrl, endpointUrl);
}

function toIsoString(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }

  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  }

  return '';
}

function addMinutesToIso(isoString, minutes) {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Date(parsed.getTime() + (minutes * 60000)).toISOString();
}

function toCacheLocationKey(location) {
  const id = String(location?.id || '').trim();
  if (id) return id;

  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `${lat.toFixed(5)},${lng.toFixed(5)}`;
  }

  return String(location?.name || 'unknown-location').trim().toLowerCase();
}

function bucketDateTimeIso(dateTime, bucketMinutes) {
  const parsed = new Date(dateTime);
  if (Number.isNaN(parsed.getTime())) {
    return toIsoString(new Date());
  }

  const bucket = Math.max(1, Math.round(Number(bucketMinutes) || 15));
  const minute = parsed.getUTCMinutes();
  const bucketedMinute = Math.floor(minute / bucket) * bucket;

  parsed.setUTCMinutes(bucketedMinute, 0, 0);
  return parsed.toISOString();
}

function roundMinutes(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.round(numeric));
}

function roundDistanceKm(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Number(numeric.toFixed(2));
}

function decodePolyline(encoded) {
  const value = String(encoded || '').trim();
  if (!value) return [];

  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates = [];

  while (index < value.length) {
    let result = 0;
    let shift = 0;
    let byte;

    do {
      byte = value.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= value.length);

    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    result = 0;
    shift = 0;

    do {
      byte = value.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= value.length);

    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    coordinates.push([lat / 1e5, lng / 1e5]);
  }

  return coordinates.filter(([pointLat, pointLng]) => Number.isFinite(pointLat) && Number.isFinite(pointLng));
}

function appendUniqueGeometryPoints(points, additions) {
  for (const point of additions) {
    if (!Array.isArray(point) || point.length !== 2) continue;
    const [lat, lng] = point;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const previous = points[points.length - 1];
    if (previous && previous[0] === lat && previous[1] === lng) {
      continue;
    }

    points.push([lat, lng]);
  }

  return points;
}

function asOtpTimeIso(value) {
  return toIsoString(value);
}

function getTransitRouteLabel(leg) {
  return String(
    leg?.route?.shortName
    || leg?.route?.longName
    || leg?.route?.gtfsId
    || leg?.headsign
    || ''
  ).trim();
}

function inferWaitMinutesFromOtpLegs(legs) {
  let totalWaitMinutes = 0;

  for (let index = 0; index < legs.length - 1; index += 1) {
    const currentEnd = Number(legs[index]?.endTime);
    const nextStart = Number(legs[index + 1]?.startTime);

    if (!Number.isFinite(currentEnd) || !Number.isFinite(nextStart) || nextStart <= currentEnd) {
      continue;
    }

    totalWaitMinutes += Math.round((nextStart - currentEnd) / 60000);
  }

  return Math.max(0, totalWaitMinutes);
}

function buildMockTransitRoute(origin, destination, options = {}) {
  const fallbackReason = String(options.reason || 'mock-config-enabled');
  const directKm = haversineDistanceKm(origin, destination);
  const walkToStopMinutes = Math.max(4, Math.round(directKm * 6));
  const rideMinutes = Math.max(6, Math.round(directKm * 2.4));
  const walkFromStopMinutes = Math.max(3, Math.round(directKm * 4));
  const durationMinutes = walkToStopMinutes + rideMinutes + walkFromStopMinutes;
  const waitMinutes = 3;
  const departureTimeIso = toIsoString(options.dateTime || new Date());
  const walkToStopEndIso = addMinutesToIso(departureTimeIso, walkToStopMinutes);
  const boardingIso = addMinutesToIso(walkToStopEndIso, waitMinutes);
  const rideEndIso = addMinutesToIso(boardingIso, rideMinutes);
  const arrivalTimeIso = addMinutesToIso(rideEndIso, walkFromStopMinutes);

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
      {
        mode: 'WALK',
        from: 'Origin',
        to: 'Boarding stop',
        startTimeIso: departureTimeIso,
        endTimeIso: walkToStopEndIso,
        durationMinutes: walkToStopMinutes,
        distanceKm: Number((directKm * 0.2).toFixed(2)),
        isTransitLeg: false,
      },
      {
        mode: 'BUS',
        routeLabel: 'Mock Bus',
        headsign: 'Destination',
        from: 'Boarding stop',
        to: 'Alighting stop',
        fromStopId: 'mock-stop-origin',
        toStopId: 'mock-stop-destination',
        startTimeIso: boardingIso,
        endTimeIso: rideEndIso,
        durationMinutes: rideMinutes,
        distanceKm: Number((directKm * 0.95).toFixed(2)),
        isTransitLeg: true,
      },
      {
        mode: 'WALK',
        from: 'Alighting stop',
        to: 'Destination',
        startTimeIso: rideEndIso,
        endTimeIso: arrivalTimeIso,
        durationMinutes: walkFromStopMinutes,
        distanceKm: Number((directKm * 0.2).toFixed(2)),
        isTransitLeg: false,
      },
    ],
    isScheduleAware: false,
    isMock: true,
    unavailable: Boolean(options.unavailable),
    notice: buildTransitNotice(fallbackReason),
    departureTimeIso,
    arrivalTimeIso,
    transferCount: 0,
    walkMinutes: walkToStopMinutes + walkFromStopMinutes,
    waitMinutes,
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
  return String(leg?.mode || 'WALK').toUpperCase();
}

function normalizeOtpItinerary(itinerary) {
  const legs = Array.isArray(itinerary?.legs) ? itinerary.legs : [];
  const totalDistanceKm = legs.reduce((sum, leg) => sum + (Number(leg?.distance || 0) / 1000), 0);
  const geometry = legs.reduce((points, leg) => {
    const encodedGeometry = String(leg?.legGeometry?.points || '').trim();
    if (encodedGeometry) {
      return appendUniqueGeometryPoints(points, decodePolyline(encodedGeometry));
    }

    const from = leg?.from;
    const to = leg?.to;
    const fallbackPoints = [];

    if (Number.isFinite(Number(from?.lat)) && Number.isFinite(Number(from?.lon))) {
      fallbackPoints.push([Number(from.lat), Number(from.lon)]);
    }

    if (Number.isFinite(Number(to?.lat)) && Number.isFinite(Number(to?.lon))) {
      fallbackPoints.push([Number(to.lat), Number(to.lon)]);
    }

    return appendUniqueGeometryPoints(points, fallbackPoints);
  }, []);

  const legSummaries = legs.map((leg, index) => {
    const fromName = String(leg?.from?.name || 'Start').trim();
    const toName = String(leg?.to?.name || 'End').trim();
    const mode = String(leg?.mode || (leg?.transitLeg ? 'TRANSIT' : 'WALK')).toUpperCase();
    const routeLabel = getTransitRouteLabel(leg);

    return {
      summary: routeLabel ? `${mode} ${routeLabel}: ${fromName} -> ${toName}` : `${mode}: ${fromName} -> ${toName}`,
      durationMinutes: Math.max(1, Math.round(Number(leg?.duration || 0) / 60)),
      distanceKm: Number((Number(leg?.distance || 0) / 1000).toFixed(2)),
    };
  });

  const transitLegs = legs.map((leg) => ({
    mode: extractOtpLegMode(leg),
    routeLabel: getTransitRouteLabel(leg) || undefined,
    headsign: leg?.headsign ? String(leg.headsign) : undefined,
    from: leg?.from?.name ? String(leg.from.name) : undefined,
    to: leg?.to?.name ? String(leg.to.name) : undefined,
    fromStopId: leg?.from?.stop?.gtfsId ? String(leg.from.stop.gtfsId) : undefined,
    toStopId: leg?.to?.stop?.gtfsId ? String(leg.to.stop.gtfsId) : undefined,
    startTimeIso: asOtpTimeIso(leg?.startTime),
    endTimeIso: asOtpTimeIso(leg?.endTime),
    durationMinutes: Math.max(1, Math.round(Number(leg?.duration || 0) / 60)),
    distanceKm: Number((Number(leg?.distance || 0) / 1000).toFixed(2)),
    isTransitLeg: Boolean(leg?.transitLeg),
  }));

  const transferCount = Number.isFinite(Number(itinerary?.numberOfTransfers))
    ? Math.max(0, Math.round(Number(itinerary.numberOfTransfers)))
    : Math.max(0, transitLegs.filter((leg) => leg.isTransitLeg).length - 1);

  const walkMinutes = Number.isFinite(Number(itinerary?.walkTime))
    ? Math.max(0, Math.round(Number(itinerary.walkTime) / 60))
    : transitLegs
      .filter((leg) => leg.mode === 'WALK')
      .reduce((sum, leg) => sum + leg.durationMinutes, 0);

  const waitMinutes = Number.isFinite(Number(itinerary?.waitingTime))
    ? Math.max(0, Math.round(Number(itinerary.waitingTime) / 60))
    : inferWaitMinutesFromOtpLegs(legs);

  return normalizeRouteEstimate({
    provider: 'otp',
    travelMethod: 'transit',
    profile: 'otp-transit',
    distanceKm: Number(totalDistanceKm.toFixed(2)),
    durationMinutes: Math.max(1, Math.round(Number(itinerary?.duration || 0) / 60)),
    geometry,
    legs: legSummaries,
    transitLegs,
    isScheduleAware: true,
    isMock: false,
    departureTimeIso: asOtpTimeIso(itinerary?.startTime),
    arrivalTimeIso: asOtpTimeIso(itinerary?.endTime),
    transferCount,
    walkMinutes,
    waitMinutes,
  });
}

function buildLegacyOtpItineraryFromGraphql(itinerary) {
  return {
    startTime: itinerary?.start,
    endTime: itinerary?.end,
    duration: Number(itinerary?.duration || 0),
    numberOfTransfers: Number(itinerary?.numberOfTransfers || 0),
    walkTime: Number(itinerary?.walkTime || 0),
    waitingTime: Number(itinerary?.waitingTime || 0),
    legs: Array.isArray(itinerary?.legs)
      ? itinerary.legs.map((leg) => ({
        mode: leg?.mode,
        transitLeg: Boolean(leg?.transitLeg),
        headsign: leg?.headsign,
        duration: Number(leg?.duration || 0),
        distance: Number(leg?.distance || 0),
        from: {
          name: leg?.from?.name,
          lat: leg?.from?.lat,
          lon: leg?.from?.lon,
          stop: leg?.from?.stop?.gtfsId
            ? { gtfsId: leg.from.stop.gtfsId }
            : undefined,
        },
        to: {
          name: leg?.to?.name,
          lat: leg?.to?.lat,
          lon: leg?.to?.lon,
          stop: leg?.to?.stop?.gtfsId
            ? { gtfsId: leg.to.stop.gtfsId }
            : undefined,
        },
        route: leg?.route
          ? {
            shortName: leg.route.shortName,
            longName: leg.route.longName,
            gtfsId: leg.route.gtfsId,
          }
          : undefined,
        legGeometry: leg?.legGeometry?.points
          ? { points: String(leg.legGeometry.points) }
          : undefined,
        startTime: leg?.start?.scheduledTime,
        endTime: leg?.end?.scheduledTime,
      }))
      : [],
  };
}

async function fetchOtpRestItinerary(endpointUrl, { origin, destination, dateTime, signal }) {
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

  const response = await fetch(`${endpointUrl}?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`otp-http-error:${response.status}`);
  }

  const data = await response.json();
  const itinerary = data?.plan?.itineraries?.[0];
  if (!itinerary) {
    throw new Error('otp-no-itinerary');
  }

  return itinerary;
}

async function fetchOtpGraphqlItinerary(endpointUrl, { origin, destination, dateTime, signal }) {
  const departureIso = toIsoString(dateTime || new Date());
  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    signal,
    body: JSON.stringify({
      query: OTP_GRAPHQL_PLAN_QUERY,
      variables: {
        origin: {
          label: String(origin?.name || 'Origin'),
          location: {
            coordinate: {
              latitude: Number(origin?.lat),
              longitude: Number(origin?.lng),
            },
          },
        },
        destination: {
          label: String(destination?.name || 'Destination'),
          location: {
            coordinate: {
              latitude: Number(destination?.lat),
              longitude: Number(destination?.lng),
            },
          },
        },
        dateTime: departureIso ? { earliestDeparture: departureIso } : null,
        first: 1,
        modes: {
          transitOnly: true,
          transit: {
            access: ['WALK'],
            egress: ['WALK'],
            transfer: ['WALK'],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`otp-http-error:${response.status}`);
  }

  const data = await response.json();
  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    throw new Error(`otp-graphql-error:${String(data.errors[0]?.message || 'unknown')}`);
  }

  const planConnection = data?.data?.planConnection;
  const itinerary = planConnection?.edges?.[0]?.node;
  if (!itinerary) {
    const routingErrors = Array.isArray(planConnection?.routingErrors)
      ? planConnection.routingErrors
        .map((error) => String(error?.description || error?.code || '').trim())
        .filter(Boolean)
      : [];

    if (routingErrors.length > 0) {
      throw new Error(`otp-no-itinerary:${routingErrors.join(' | ')}`);
    }

    throw new Error('otp-no-itinerary');
  }

  return buildLegacyOtpItineraryFromGraphql(itinerary);
}

export async function getTransitRouteEstimate({ origin, destination, dateTime = new Date().toISOString() }) {
  if (!origin || !destination) {
    throw new Error('Origin and destination are required for transit estimation.');
  }

  const { forceMockTransit, otpBaseUrl, timeoutMs } = getTransitRuntimeConfig();

  if (forceMockTransit) {
    return buildMockTransitRoute(origin, destination, {
      dateTime,
      reason: 'mock-config-enabled',
      unavailable: false,
    });
  }

  if (!otpBaseUrl) {
    return buildMockTransitRoute(origin, destination, {
      dateTime,
      reason: 'otp-not-configured',
      unavailable: true,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const endpointCandidates = getOtpEndpointCandidates(otpBaseUrl);
    let lastError = null;

    for (const endpointCandidate of endpointCandidates) {
      try {
        const itinerary = endpointCandidate.kind === 'graphql'
          ? await fetchOtpGraphqlItinerary(endpointCandidate.url, {
            origin,
            destination,
            dateTime,
            signal: controller.signal,
          })
          : await fetchOtpRestItinerary(endpointCandidate.url, {
            origin,
            destination,
            dateTime,
            signal: controller.signal,
          });

        rememberOtpEndpointSuccess(otpBaseUrl, endpointCandidate.url);
        return normalizeOtpItinerary(itinerary);
      } catch (error) {
        lastError = error;
        const message = String(error?.message || '');
        if (message.startsWith('otp-http-error:404') || message.startsWith('otp-http-error:405')) {
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error('otp-request-failed');
  } catch (error) {
    console.warn('OTP transit routing unavailable, using mock transit fallback:', error);
    let fallbackReason = 'otp-request-failed';
    if (error?.name === 'AbortError') {
      fallbackReason = 'otp-timeout';
    } else if (String(error?.message || '').startsWith('otp-http-error')) {
      fallbackReason = 'otp-http-error';
    } else if (String(error?.message || '').startsWith('otp-graphql-error')) {
      fallbackReason = 'otp-http-error';
    } else if (String(error?.message || '').includes('otp-no-itinerary')) {
      fallbackReason = 'otp-no-itinerary';
    }

    return buildMockTransitRoute(origin, destination, {
      dateTime,
      reason: fallbackReason,
      unavailable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

export function createTransitTravelTimeCache(options = {}) {
  const bucketMinutes = Math.max(1, Math.round(Number(options?.bucketMinutes) || 15));
  const cache = new Map();

  const getTravelEstimate = async ({ origin, destination, dateTime = new Date().toISOString() }) => {
    const bucketIso = bucketDateTimeIso(dateTime, bucketMinutes);
    const cacheKey = `${toCacheLocationKey(origin)}::${toCacheLocationKey(destination)}::${bucketIso}`;

    if (!cache.has(cacheKey)) {
      cache.set(cacheKey, getTransitRouteEstimate({ origin, destination, dateTime: bucketIso }));
    }

    return cache.get(cacheKey);
  };

  return {
    getTravelEstimate,
    async getTravelMinutes(args) {
      const estimate = await getTravelEstimate(args);
      return Math.max(0, Math.round(Number(estimate?.durationMinutes) || 0));
    },
    get size() {
      return cache.size;
    },
  };
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
        routeLabel: leg?.routeLabel ? String(leg.routeLabel) : undefined,
        headsign: leg?.headsign ? String(leg.headsign) : undefined,
        from: leg?.from ? String(leg.from) : undefined,
        to: leg?.to ? String(leg.to) : undefined,
        fromStopId: leg?.fromStopId ? String(leg.fromStopId) : undefined,
        toStopId: leg?.toStopId ? String(leg.toStopId) : undefined,
        startTimeIso: toIsoString(leg?.startTimeIso),
        endTimeIso: toIsoString(leg?.endTimeIso),
        durationMinutes: Math.max(1, Math.round(Number(leg?.durationMinutes) || 1)),
        distanceKm: roundDistanceKm(leg?.distanceKm),
        isTransitLeg: Boolean(leg?.isTransitLeg),
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
    departureTimeIso: toIsoString(raw?.departureTimeIso),
    arrivalTimeIso: toIsoString(raw?.arrivalTimeIso),
    transferCount: roundMinutes(raw?.transferCount),
    walkMinutes: roundMinutes(raw?.walkMinutes),
    waitMinutes: roundMinutes(raw?.waitMinutes),
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
