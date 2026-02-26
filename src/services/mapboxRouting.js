const MAPBOX_PROFILE_BY_METHOD = {
  walk: 'walking',
  car: 'driving',
  transit: 'driving-traffic',
};

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

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

function dedupePoints(points) {
  const output = [];
  const seen = new Set();

  for (const point of points) {
    if (!point) continue;
    const key = `${point.lat.toFixed(6)}|${point.lng.toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(point);
  }

  return output;
}

function buildRouteInput({ locations = [], origin, destination }) {
  const normalizedLocations = Array.isArray(locations) ? locations.filter(Boolean) : [];

  const middleStops = normalizedLocations.filter((item) => {
    if (!item) return false;
    if (origin && item.id === origin.id) return false;
    if (destination && item.id === destination.id) return false;
    return true;
  });

  return dedupePoints([origin, ...middleStops, destination]);
}

function optimizeStopOrderApprox(points) {
  if (points.length <= 3) return points;

  const origin = points[0];
  const destination = points[points.length - 1];
  const middle = points.slice(1, -1);
  const ordered = [origin];

  let current = origin;
  const remaining = [...middle];

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const distance = haversineDistanceKm(current, candidate);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }

    const next = remaining.splice(nearestIndex, 1)[0];
    ordered.push(next);
    current = next;
  }

  ordered.push(destination);
  return ordered;
}

function buildMockPolyline(points) {
  if (points.length === 0) return [];

  const geometry = [[points[0].lat, points[0].lng]];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];

    const midLat = (previous.lat + current.lat) / 2 + (index % 2 === 0 ? 0.002 : -0.002);
    const midLng = (previous.lng + current.lng) / 2 + (index % 2 === 0 ? -0.002 : 0.002);

    geometry.push([midLat, midLng]);
    geometry.push([current.lat, current.lng]);
  }

  return geometry;
}

function buildMockRoute(points, travelMethod) {
  const speedKmHByMethod = {
    walk: 5,
    car: 42,
    transit: 24,
  };

  if (points.length < 2) {
    throw new Error('At least two points are required for route estimation.');
  }

  const speedKmH = speedKmHByMethod[travelMethod] || 5;
  let totalKm = 0;
  const legs = [];

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const legKm = haversineDistanceKm(from, to) * 1.22;
    totalKm += legKm;
    legs.push({
      summary: `${from.name || 'Stop'} → ${to.name || 'Stop'}`,
      distanceKm: Number(legKm.toFixed(2)),
      durationMinutes: Math.max(1, Math.round((legKm / speedKmH) * 60)),
    });
  }

  const durationMinutes = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);

  return {
    provider: 'mock',
    profile: MAPBOX_PROFILE_BY_METHOD[travelMethod] || 'walking',
    distanceKm: Number(totalKm.toFixed(2)),
    durationMinutes,
    geometry: buildMockPolyline(points),
    legs,
    stopCount: points.length,
  };
}

function normalizeMapboxRoute(route, travelMethodOrProfile) {
  const profile = MAPBOX_PROFILE_BY_METHOD[travelMethodOrProfile] || travelMethodOrProfile || 'walking';

  return {
    provider: 'mapbox',
    profile,
    distanceKm: Number((route.distance / 1000).toFixed(2)),
    durationMinutes: Math.max(1, Math.round(route.duration / 60)),
    geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    legs: (route.legs || []).map((leg, index) => ({
      summary: leg.summary || `Leg ${index + 1}`,
      durationMinutes: Math.max(1, Math.round(leg.duration / 60)),
      distanceKm: Number((leg.distance / 1000).toFixed(2)),
    })),
    stopCount: (route.legs || []).length + 1,
  };
}

async function fetchMapboxDirections({ points, profile, mapboxToken }) {
  const coordinates = points.map((point) => `${point.lng},${point.lat}`).join(';');
  const params = new URLSearchParams({
    geometries: 'geojson',
    overview: 'full',
    steps: 'true',
    alternatives: 'false',
    access_token: mapboxToken,
  });

  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?${params.toString()}`;
  const response = await fetchWithTimeout(url, {}, 12000);

  if (!response.ok) {
    throw new Error(`Mapbox directions failed (${response.status}).`);
  }

  const data = await response.json();
  const firstRoute = data?.routes?.[0];

  if (!firstRoute || !firstRoute.geometry?.coordinates?.length) {
    throw new Error('Mapbox directions returned no valid route.');
  }

  return normalizeMapboxRoute(firstRoute, profile);
}

async function fetchMapboxOptimizedRoute({ points, profile, mapboxToken }) {
  const coordinates = points.map((point) => `${point.lng},${point.lat}`).join(';');
  const params = new URLSearchParams({
    geometries: 'geojson',
    overview: 'full',
    steps: 'true',
    source: 'first',
    destination: 'last',
    roundtrip: 'false',
    access_token: mapboxToken,
  });

  const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/${profile}/${coordinates}?${params.toString()}`;
  const response = await fetchWithTimeout(url, {}, 8000);

  if (!response.ok) {
    throw new Error(`Mapbox optimization failed (${response.status}).`);
  }

  const data = await response.json();
  const trip = data?.trips?.[0];

  if (!trip || !trip.geometry?.coordinates?.length) {
    throw new Error('Mapbox optimization returned no valid route.');
  }

  return normalizeMapboxRoute(trip, profile);
}

export async function getRouteEstimate({
  origin,
  destination,
  locations = [],
  travelMethod = 'walk',
  onStatus,
}) {
  const startedAt = Date.now();
  const emitStatus = (message) => {
    if (!onStatus) return;
    onStatus({
      message,
      elapsedMs: Date.now() - startedAt,
    });
  };

  emitStatus('Validating route endpoints...');

  if (!origin || !destination) {
    throw new Error('Origin and destination are required for route estimation.');
  }

  const points = buildRouteInput({ locations, origin, destination });
  emitStatus(`Prepared ${points.length} stop(s).`);

  if (points.length < 2) {
    throw new Error('At least two route points are required.');
  }

  const approximatedPoints = optimizeStopOrderApprox(points);

  const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
  const forceMock = import.meta.env.VITE_USE_MOCK_ROUTING !== 'false';
  const profile = MAPBOX_PROFILE_BY_METHOD[travelMethod] || 'walking';

  if (forceMock || !mapboxToken) {
    emitStatus('Using mock routing provider...');
    return buildMockRoute(approximatedPoints, travelMethod);
  }

  if (points.length > 2) {
    try {
      emitStatus('Calling Mapbox Optimization API...');
      return await fetchMapboxOptimizedRoute({ points, profile, mapboxToken });
    } catch (error) {
      emitStatus('Optimization unavailable, falling back to Directions API...');
      console.warn('Optimization endpoint failed, falling back to Directions API:', error);
    }
  }

  emitStatus('Calling Mapbox Directions API...');
  return fetchMapboxDirections({ points: approximatedPoints, profile, mapboxToken });
}
