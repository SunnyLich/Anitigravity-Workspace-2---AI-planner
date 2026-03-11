import React, { useState, useEffect } from 'react';
import { Compass, Search, CalendarCheck, Settings, MapPin } from 'lucide-react';
import { TripFormWindow, WindowWrapper } from './components/TripFormWindow';
import ItineraryWindow from './components/ItineraryWindow';
import MapDisplay from './components/MapDisplay';
import { TSPSolver } from './utils/tspSolver';
import { createTransitTravelTimeCache, getRouteEstimate } from './services/mapboxRouting';
import { reverseGeocodeLocation } from './services/nominatim';
import { createCustomLocation, normalizeLocation } from './utils/locationModel';
import { loadPoisFromFolder } from './utils/poiLoader';

const CUSTOM_NODES_STORAGE_KEY = 'tripoptimizer.customNodes';
const TRIP_LOCATIONS_STORAGE_KEY = 'tripoptimizer.tripLocations';
const SELECTED_ENDPOINTS_STORAGE_KEY = 'tripoptimizer.selectedEndpoints';
const TRAVEL_METHOD_STORAGE_KEY = 'tripoptimizer.travelMethod';
const OPTIMIZER_MODE_STORAGE_KEY = 'tripoptimizer.optimizerMode';
const TIME_BUDGET_STORAGE_KEY = 'tripoptimizer.timeBudgetMinutes';
const TRIP_START_TIME_STORAGE_KEY = 'tripoptimizer.tripStartTime';
const TRIP_END_TIME_STORAGE_KEY = 'tripoptimizer.tripEndTime';
const TRIP_START_DATE_STORAGE_KEY = 'tripoptimizer.tripStartDate';
const TRIP_END_DATE_STORAGE_KEY = 'tripoptimizer.tripEndDate';
const WAKE_TIME_STORAGE_KEY = 'tripoptimizer.wakeTime';
const SLEEP_TIME_STORAGE_KEY = 'tripoptimizer.sleepTime';
const BREAK_TIME_STORAGE_KEY = 'tripoptimizer.breakTimeMinutes';
const USE_MOCK_TRANSIT_STORAGE_KEY = 'tripoptimizer.useMockTransit';
const OTP_BASE_URL_STORAGE_KEY = 'tripoptimizer.otpBaseUrl';
const FALLBACK_OTP_BASE_URL = 'http://localhost:8080/';

const LOCATION_KEY_PRECISION = 5;
const TIME_INPUT_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DEFAULT_USE_MOCK_TRANSIT = import.meta.env.VITE_USE_MOCK_TRANSIT !== 'false';
const DEFAULT_OTP_BASE_URL = String(import.meta.env.VITE_OTP_BASE_URL || FALLBACK_OTP_BASE_URL).trim();

const resolveOtpBaseUrl = (rawValue) => String(rawValue || '').trim() || DEFAULT_OTP_BASE_URL;

const combineDateTime = (dateValue, timeValue) => {
  if (!dateValue || !TIME_INPUT_REGEX.test(String(timeValue || ''))) return null;
  const parsed = new Date(`${dateValue}T${timeValue}:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const computeConstrainedMinutes = ({ tripStartDate, tripStartTime, tripEndDate, tripEndTime, wakeTime, sleepTime }) => {
  const rangeStart = combineDateTime(tripStartDate, tripStartTime);
  const rangeEnd = combineDateTime(tripEndDate, tripEndTime);

  if (!rangeStart || !rangeEnd || rangeEnd <= rangeStart) {
    return { isValid: false, totalMinutes: 0 };
  }

  if (!TIME_INPUT_REGEX.test(String(wakeTime || '')) || !TIME_INPUT_REGEX.test(String(sleepTime || ''))) {
    return { isValid: false, totalMinutes: 0 };
  }

  const [wakeHour, wakeMinute] = wakeTime.split(':').map(Number);
  const [sleepHour, sleepMinute] = sleepTime.split(':').map(Number);
  const wakeMinutes = (wakeHour * 60) + wakeMinute;
  const sleepMinutes = (sleepHour * 60) + sleepMinute;

  if (wakeMinutes === sleepMinutes) {
    return { isValid: false, totalMinutes: 0 };
  }

  const dayCursor = new Date(rangeStart);
  dayCursor.setHours(0, 0, 0, 0);

  const rangeEndDay = new Date(rangeEnd);
  rangeEndDay.setHours(0, 0, 0, 0);

  let totalMinutes = 0;

  while (dayCursor <= rangeEndDay) {
    const dayStart = new Date(dayCursor);
    const nextDayStart = new Date(dayCursor);
    nextDayStart.setDate(nextDayStart.getDate() + 1);

    const windows = [];

    if (wakeMinutes < sleepMinutes) {
      const activeStart = new Date(dayStart);
      activeStart.setMinutes(wakeMinutes);
      const activeEnd = new Date(dayStart);
      activeEnd.setMinutes(sleepMinutes);
      windows.push([activeStart, activeEnd]);
    } else {
      const lateStart = new Date(dayStart);
      lateStart.setMinutes(wakeMinutes);
      windows.push([lateStart, nextDayStart]);

      const earlyEnd = new Date(dayStart);
      earlyEnd.setMinutes(sleepMinutes);
      windows.push([dayStart, earlyEnd]);
    }

    for (const [windowStart, windowEnd] of windows) {
      const effectiveStart = windowStart > rangeStart ? windowStart : rangeStart;
      const effectiveEnd = windowEnd < rangeEnd ? windowEnd : rangeEnd;
      const minutes = Math.max(0, Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / 60000));
      totalMinutes += minutes;
    }

    dayCursor.setDate(dayCursor.getDate() + 1);
  }

  return {
    isValid: totalMinutes > 0,
    totalMinutes,
  };
};

const toMinutes = (timeValue) => {
  const [h, m] = String(timeValue || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return (h * 60) + m;
};

const toLocationKey = (location) => {
  const name = String(location?.name || '').trim().toLowerCase();
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return `${name}|invalid`;
  }

  return `${name}|${lat.toFixed(LOCATION_KEY_PRECISION)}|${lng.toFixed(LOCATION_KEY_PRECISION)}`;
};

function App() {
  const today = new Date().toISOString().split('T')[0];

  const [locations, setLocations] = useState([]);
  const [itinerary, setItinerary] = useState([]);
  const [travelMethod, setTravelMethod] = useState('walk');
  const [itineraryTravelMethod, setItineraryTravelMethod] = useState('walk');
  const [tripDate, setTripDate] = useState(() => today);
  const [tripStartDate, setTripStartDate] = useState(() => today);
  const [tripEndDate, setTripEndDate] = useState(() => today);
  const [tripStartTime, setTripStartTime] = useState('09:00');
  const [tripEndTime, setTripEndTime] = useState('17:00');
  const [wakeTime, setWakeTime] = useState('07:00');
  const [sleepTime, setSleepTime] = useState('23:00');
  const [optimizerMode, setOptimizerMode] = useState('shortest-feasible');
  const [timeBudgetMinutes, setTimeBudgetMinutes] = useState(240);
  const [breakTimeMinutes, setBreakTimeMinutes] = useState(15);
  const [useMockTransit, setUseMockTransit] = useState(DEFAULT_USE_MOCK_TRANSIT);
  const [otpBaseUrl, setOtpBaseUrl] = useState(() => resolveOtpBaseUrl());
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [routeEstimate, setRouteEstimate] = useState(null);
  const [routeEndpoints, setRouteEndpoints] = useState({ origin: null, destination: null, source: null });
  const [mapFocusTarget, setMapFocusTarget] = useState(null);
  const [scheduleRecenterKey, setScheduleRecenterKey] = useState(0);
  const [selectedStartId, setSelectedStartId] = useState('');
  const [selectedDestinationId, setSelectedDestinationId] = useState('');
  const [customNodes, setCustomNodes] = useState([]);
  const [customNodesHydrated, setCustomNodesHydrated] = useState(false);
  const [pois, setPois] = useState([]);
  const [mapContextMenu, setMapContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    lat: null,
    lng: null,
    sourceType: 'map',
    sourceId: null,
    sourceName: '',
    sourceAddress: '',
    sourceOpeningHours: null,
    sourceOpeningHoursText: '',
  });
  const [customNodeDraft, setCustomNodeDraft] = useState({ open: false, lat: null, lng: null, name: '', note: '' });

  // Window Visibility State
  const [windows, setWindows] = useState({
    search: true,
    itinerary: false,
    settings: false
  });

  useEffect(() => {
    try {
      const loadedPois = loadPoisFromFolder();
      setPois(Array.isArray(loadedPois) ? loadedPois : []);
    } catch (error) {
      console.warn('Could not load POIs from folder:', error);
      setPois([]);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_NODES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const normalized = Array.isArray(parsed)
          ? parsed.map(item => normalizeLocation(item, 'custom')).filter(Boolean)
          : [];

        setCustomNodes(normalized);
      }
    } catch (error) {
      console.warn('Could not load custom nodes from storage:', error);
    } finally {
      // Avoid clobbering persisted data on first mount before hydration completes.
      setCustomNodesHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!customNodesHydrated) return;

    try {
      localStorage.setItem(CUSTOM_NODES_STORAGE_KEY, JSON.stringify(customNodes));
    } catch (error) {
      console.warn('Could not save custom nodes:', error);
    }
  }, [customNodes, customNodesHydrated]);

  useEffect(() => {
    try {
      const rawLocations = localStorage.getItem(TRIP_LOCATIONS_STORAGE_KEY);
      const rawTravelMethod = localStorage.getItem(TRAVEL_METHOD_STORAGE_KEY);
      const rawEndpoints = localStorage.getItem(SELECTED_ENDPOINTS_STORAGE_KEY);
      const rawOptimizerMode = localStorage.getItem(OPTIMIZER_MODE_STORAGE_KEY);
      const rawTimeBudgetMinutes = localStorage.getItem(TIME_BUDGET_STORAGE_KEY);
      const rawTripStartTime = localStorage.getItem(TRIP_START_TIME_STORAGE_KEY);
      const rawTripEndTime = localStorage.getItem(TRIP_END_TIME_STORAGE_KEY);
      const rawTripStartDate = localStorage.getItem(TRIP_START_DATE_STORAGE_KEY);
      const rawTripEndDate = localStorage.getItem(TRIP_END_DATE_STORAGE_KEY);
      const rawWakeTime = localStorage.getItem(WAKE_TIME_STORAGE_KEY);
      const rawSleepTime = localStorage.getItem(SLEEP_TIME_STORAGE_KEY);
      const rawBreakTimeMinutes = localStorage.getItem(BREAK_TIME_STORAGE_KEY);
      const rawUseMockTransit = localStorage.getItem(USE_MOCK_TRANSIT_STORAGE_KEY);
      const rawOtpBaseUrl = localStorage.getItem(OTP_BASE_URL_STORAGE_KEY);

      if (rawLocations) {
        const parsedLocations = JSON.parse(rawLocations);
        const normalizedLocations = Array.isArray(parsedLocations)
          ? parsedLocations.map(item => normalizeLocation(item, item.source || 'search')).filter(Boolean)
          : [];
        setLocations(normalizedLocations);
      }

      if (rawTravelMethod && ['walk', 'car', 'transit'].includes(rawTravelMethod)) {
        setTravelMethod(rawTravelMethod);
      }

      if (rawOptimizerMode && ['shortest-feasible', 'max-priority-budget', 'time-constrained-fit'].includes(rawOptimizerMode)) {
        setOptimizerMode(rawOptimizerMode === 'max-priority-budget' ? 'time-constrained-fit' : rawOptimizerMode);
      }

      if (Number.isFinite(Number(rawTimeBudgetMinutes))) {
        const parsedBudget = Math.round(Number(rawTimeBudgetMinutes));
        setTimeBudgetMinutes(Math.min(24 * 60, Math.max(30, parsedBudget)));
      }

      if (TIME_INPUT_REGEX.test(String(rawTripStartTime || ''))) {
        setTripStartTime(String(rawTripStartTime));
      }

      if (TIME_INPUT_REGEX.test(String(rawTripEndTime || ''))) {
        setTripEndTime(String(rawTripEndTime));
      }

      if (/^\d{4}-\d{2}-\d{2}$/.test(String(rawTripStartDate || ''))) {
        setTripStartDate(String(rawTripStartDate));
      }

      if (/^\d{4}-\d{2}-\d{2}$/.test(String(rawTripEndDate || ''))) {
        setTripEndDate(String(rawTripEndDate));
      }

      if (TIME_INPUT_REGEX.test(String(rawWakeTime || ''))) {
        setWakeTime(String(rawWakeTime));
      }

      if (TIME_INPUT_REGEX.test(String(rawSleepTime || ''))) {
        setSleepTime(String(rawSleepTime));
      }

      if (Number.isFinite(Number(rawBreakTimeMinutes))) {
        const parsedBreak = Math.round(Number(rawBreakTimeMinutes));
        setBreakTimeMinutes(Math.min(180, Math.max(0, parsedBreak)));
      }

      if (rawUseMockTransit === 'true' || rawUseMockTransit === 'false') {
        setUseMockTransit(rawUseMockTransit === 'true');
      }

      if (typeof rawOtpBaseUrl === 'string') {
        setOtpBaseUrl(resolveOtpBaseUrl(rawOtpBaseUrl));
      }

      if (rawEndpoints) {
        const parsedEndpoints = JSON.parse(rawEndpoints);
        setSelectedStartId(parsedEndpoints.selectedStartId || '');
        setSelectedDestinationId(parsedEndpoints.selectedDestinationId || '');
      }
    } catch (error) {
      console.warn('Could not restore trip session:', error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(TRIP_LOCATIONS_STORAGE_KEY, JSON.stringify(locations));
    } catch (error) {
      console.warn('Could not save trip locations:', error);
    }
  }, [locations]);

  useEffect(() => {
    try {
      localStorage.setItem(TRAVEL_METHOD_STORAGE_KEY, travelMethod);
    } catch (error) {
      console.warn('Could not save travel method:', error);
    }
  }, [travelMethod]);

  useEffect(() => {
    try {
      localStorage.setItem(OPTIMIZER_MODE_STORAGE_KEY, optimizerMode);
    } catch (error) {
      console.warn('Could not save optimizer mode:', error);
    }
  }, [optimizerMode]);

  useEffect(() => {
    try {
      localStorage.setItem(TIME_BUDGET_STORAGE_KEY, String(timeBudgetMinutes));
    } catch (error) {
      console.warn('Could not save time budget:', error);
    }
  }, [timeBudgetMinutes]);

  useEffect(() => {
    try {
      localStorage.setItem(TRIP_START_TIME_STORAGE_KEY, tripStartTime);
    } catch (error) {
      console.warn('Could not save trip start time:', error);
    }
  }, [tripStartTime]);

  useEffect(() => {
    try {
      localStorage.setItem(TRIP_END_TIME_STORAGE_KEY, tripEndTime);
    } catch (error) {
      console.warn('Could not save trip end time:', error);
    }
  }, [tripEndTime]);

  useEffect(() => {
    try {
      localStorage.setItem(TRIP_START_DATE_STORAGE_KEY, tripStartDate);
    } catch (error) {
      console.warn('Could not save trip start date:', error);
    }
  }, [tripStartDate]);

  useEffect(() => {
    try {
      localStorage.setItem(TRIP_END_DATE_STORAGE_KEY, tripEndDate);
    } catch (error) {
      console.warn('Could not save trip end date:', error);
    }
  }, [tripEndDate]);

  useEffect(() => {
    try {
      localStorage.setItem(WAKE_TIME_STORAGE_KEY, wakeTime);
    } catch (error) {
      console.warn('Could not save wake time:', error);
    }
  }, [wakeTime]);

  useEffect(() => {
    try {
      localStorage.setItem(SLEEP_TIME_STORAGE_KEY, sleepTime);
    } catch (error) {
      console.warn('Could not save sleep time:', error);
    }
  }, [sleepTime]);

  useEffect(() => {
    try {
      localStorage.setItem(BREAK_TIME_STORAGE_KEY, String(breakTimeMinutes));
    } catch (error) {
      console.warn('Could not save break time:', error);
    }
  }, [breakTimeMinutes]);

  useEffect(() => {
    try {
      localStorage.setItem(USE_MOCK_TRANSIT_STORAGE_KEY, String(useMockTransit));
    } catch (error) {
      console.warn('Could not save transit mock setting:', error);
    }
  }, [useMockTransit]);

  useEffect(() => {
    try {
      localStorage.setItem(OTP_BASE_URL_STORAGE_KEY, resolveOtpBaseUrl(otpBaseUrl));
    } catch (error) {
      console.warn('Could not save OTP base URL:', error);
    }
  }, [otpBaseUrl]);

  useEffect(() => {
    try {
      localStorage.setItem(
        SELECTED_ENDPOINTS_STORAGE_KEY,
        JSON.stringify({ selectedStartId, selectedDestinationId })
      );
    } catch (error) {
      console.warn('Could not save selected endpoints:', error);
    }
  }, [selectedStartId, selectedDestinationId]);

  const availableLocations = [...locations, ...customNodes];

  useEffect(() => {
    const hasStart = selectedStartId ? availableLocations.some(item => item.id === selectedStartId) : true;
    const hasDestination = selectedDestinationId ? availableLocations.some(item => item.id === selectedDestinationId) : true;

    if (!hasStart) setSelectedStartId('');
    if (!hasDestination) setSelectedDestinationId('');
  }, [availableLocations, selectedStartId, selectedDestinationId]);

  const resolveLocation = (locationId) => availableLocations.find(item => item.id === locationId) || null;

  const inferredStart = locations[0] || customNodes[0] || null;
  const inferredDestination =
    locations.length > 1
      ? locations[locations.length - 1]
      : customNodes.find(item => item.id !== (locations[0]?.id || selectedStartId)) || null;

  const selectedStartLocation = resolveLocation(selectedStartId) || inferredStart;
  const selectedDestinationLocation = resolveLocation(selectedDestinationId) || inferredDestination;

  const toggleWindow = (key) => {
    setWindows(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const focusMapOnLocation = (location) => {
    if (!location) return;
    setMapFocusTarget({
      lat: location.lat,
      lng: location.lng,
      key: `${location.id || 'focus'}-${Date.now()}`,
    });
  };

  const addLocationToTrip = (rawLocation, options = {}) => {
    const normalized = normalizeLocation(rawLocation, rawLocation.source || 'search');
    if (!normalized) return;

    const linkedCustomNodeId = rawLocation?.linkedCustomNodeId
      || (rawLocation?.source === 'custom' ? rawLocation.id : null);

    const normalizedWithLink = linkedCustomNodeId
      ? { ...normalized, linkedCustomNodeId }
      : normalized;

    if (options.focusOnMap) {
      focusMapOnLocation(normalizedWithLink);
    }

    setLocations(prev => {
      const exists = prev.some(item => item.id === normalizedWithLink.id);
      if (exists) return prev;
      return [...prev, normalizedWithLink];
    });
  };

  const removeLocationFromTrip = (locationId) => {
    setLocations(prev => prev.filter(item => item.id !== locationId));
  };

  const handleSelectStart = (locationId) => {
    setSelectedStartId(locationId || '');
    if (!locationId) return;

    const selected = resolveLocation(locationId);
    if (!selected) return;

    addLocationToTrip(selected);
  };

  const handleSelectDestination = (locationId) => {
    setSelectedDestinationId(locationId || '');
    if (!locationId) return;

    const selected = resolveLocation(locationId);
    if (!selected) return;

    addLocationToTrip(selected);
  };

  const updateTripLocationPriority = (locationId, priorityValue) => {
    const normalizedPriority = Math.min(5, Math.max(1, Math.round(Number(priorityValue) || 1)));
    setLocations((prev) => prev.map((item) => (
      item.id === locationId
        ? { ...item, priority: normalizedPriority, userPriority: normalizedPriority }
        : item
    )));
  };

  const updateTripLocationDuration = (locationId, durationValue) => {
    const normalizedDuration = Math.min(1440, Math.max(1, Math.round(Number(durationValue) || 60)));
    setLocations((prev) => prev.map((item) => (
      item.id === locationId
        ? { ...item, duration: normalizedDuration }
        : item
    )));
  };

  const updateTripLocationOpeningHours = (locationId, field, value) => {
    if (!['start', 'end'].includes(field)) return;
    const normalizedTime = TIME_INPUT_REGEX.test(String(value || '')) ? String(value) : null;
    if (!normalizedTime) return;

    setLocations((prev) => prev.map((item) => {
      if (item.id !== locationId) return item;

      const current = item?.openingHours || { start: '09:00', end: '18:00' };
      const metadata = (item && typeof item.metadata === 'object' && item.metadata)
        ? item.metadata
        : {};
      return {
        ...item,
        openingHours: {
          ...current,
          [field]: normalizedTime,
        },
        metadata: {
          ...metadata,
          openingHoursSource: 'user-edit',
        },
      };
    }));
  };

  const updateCustomNode = (locationId, updates) => {
    const nextName = String(updates.name || '').trim();
    const nextNote = typeof updates.note === 'string' ? updates.note : undefined;
    let previousNode = null;

    setCustomNodes(prev =>
      prev.map(item => {
        if (item.id !== locationId) return item;
        previousNode = item;
        return {
          ...item,
          name: nextName || item.name,
          note: nextNote ?? item.note,
        };
      })
    );

    // Keep trip entries derived from this saved node synchronized after rename/edit.
    setLocations(prev => prev.map((item) => {
      const linkedById = item.linkedCustomNodeId === locationId;
      const linkedByLegacyMatch = !item.linkedCustomNodeId
        && previousNode
        && toLocationKey(item) === toLocationKey(previousNode);

      if (!linkedById && !linkedByLegacyMatch) {
        return item;
      }

      return {
        ...item,
        linkedCustomNodeId: locationId,
        name: nextName || item.name,
        note: nextNote ?? item.note,
      };
    }));
  };

  const deleteCustomNode = (locationId) => {
    setCustomNodes(prev => prev.filter(item => item.id !== locationId));
    setSelectedStartId(prev => (prev === locationId ? '' : prev));
    setSelectedDestinationId(prev => (prev === locationId ? '' : prev));
  };

  const handleOptimize = async (payload, fallbackMethod, fallbackDate) => {
    const runLocations = Array.isArray(payload) ? payload : (payload?.locations || []);
    const method = Array.isArray(payload) ? fallbackMethod : payload?.travelMethod;
    const date = Array.isArray(payload) ? fallbackDate : payload?.tripDate;
    const mode = Array.isArray(payload) ? optimizerMode : (payload?.optimizerMode || optimizerMode);
    const requestedStartTime = Array.isArray(payload)
      ? tripStartTime
      : (payload?.tripStartTime || tripStartTime);
    const requestedEndTime = Array.isArray(payload)
      ? tripEndTime
      : (payload?.tripEndTime || tripEndTime);
    const requestedStartDate = Array.isArray(payload)
      ? tripStartDate
      : (payload?.tripStartDate || tripStartDate);
    const requestedEndDate = Array.isArray(payload)
      ? tripEndDate
      : (payload?.tripEndDate || tripEndDate);
    const requestedWakeTime = Array.isArray(payload)
      ? wakeTime
      : (payload?.wakeTime || wakeTime);
    const requestedSleepTime = Array.isArray(payload)
      ? sleepTime
      : (payload?.sleepTime || sleepTime);

    const explicitBudget = Array.isArray(payload)
      ? timeBudgetMinutes
      : Math.min(24 * 60, Math.max(30, Math.round(Number(payload?.timeBudgetMinutes) || timeBudgetMinutes)));

    const constrainedBudget = computeConstrainedMinutes({
      tripStartDate: requestedStartDate,
      tripStartTime: requestedStartTime,
      tripEndDate: requestedEndDate,
      tripEndTime: requestedEndTime,
      wakeTime: requestedWakeTime,
      sleepTime: requestedSleepTime,
    });
    const budget = mode === 'time-constrained-fit'
      ? Math.max(1, Math.round(Number(constrainedBudget.totalMinutes) || explicitBudget))
      : explicitBudget;

    setIsOptimizing(true);
    setTravelMethod(method);
    setItineraryTravelMethod(method);
    if (date) setTripDate(date);
    if (requestedStartDate) setTripStartDate(requestedStartDate);
    if (requestedEndDate) setTripEndDate(requestedEndDate);
    if (requestedStartTime) setTripStartTime(requestedStartTime);
    if (requestedEndTime) setTripEndTime(requestedEndTime);
    if (requestedWakeTime) setWakeTime(requestedWakeTime);
    if (requestedSleepTime) setSleepTime(requestedSleepTime);
    if (mode) setOptimizerMode(mode);
    if (Number.isFinite(budget)) setTimeBudgetMinutes(budget);
    setRouteEstimate(null);

    setTimeout(async () => {
      const routeStartDateTime = combineDateTime(requestedStartDate, requestedStartTime)?.toISOString();
      const transitTravelCache = method === 'transit'
        ? createTransitTravelTimeCache({ bucketMinutes: 15 })
        : null;

      const solver = new TSPSolver(runLocations, {
        travelSpeed: method === 'car' ? 40 : method === 'transit' ? 20 : 5,
        bufferTime: Math.max(0, Math.round(Number(breakTimeMinutes) || 0)),
        startTime: requestedStartTime || '09:00',
        startDateTime: routeStartDateTime,
        travelTimeProvider: transitTravelCache
          ? async ({ origin, destination, departureDateTimeIso }) => {
            if (!origin || !destination) return 0;
            if (toLocationKey(origin) === toLocationKey(destination)) return 0;

            return transitTravelCache.getTravelMinutes({
              origin,
              destination,
              dateTime: departureDateTimeIso || routeStartDateTime || new Date().toISOString(),
            });
          }
          : null,
      });

      try {
        const result = await solver.solve({
          mode,
          timeBudgetMinutes: budget,
          tripStartDate: requestedStartDate,
          tripEndDate: requestedEndDate,
          tripStartTime: requestedStartTime,
          tripEndTime: requestedEndTime,
        });

        const itineraryWithTransitDetails = method === 'transit' && transitTravelCache
          ? await Promise.all(result.map(async (item, index) => {
            const previousStop = index > 0 ? result[index - 1] : null;
            const startAnchor = runLocations[0];
            const shouldUseStartAnchor = index === 0
              && item.firstLegFromStart
              && startAnchor
              && toLocationKey(startAnchor) !== toLocationKey(item);

            const legOrigin = shouldUseStartAnchor
              ? startAnchor
              : previousStop;

            if (!legOrigin) {
              return item;
            }

            const departureDateTimeIso = shouldUseStartAnchor
              ? (routeStartDateTime || new Date().toISOString())
              : (solver.getDateTimeForAbsoluteMinutes(previousStop?.departureAbsoluteMinutes) || routeStartDateTime || new Date().toISOString());

            const transitEstimate = await transitTravelCache.getTravelEstimate({
              origin: legOrigin,
              destination: item,
              dateTime: departureDateTimeIso,
            });

            return {
              ...item,
              transitFromPrevious: {
                provider: transitEstimate.provider,
                notice: transitEstimate.notice,
                unavailable: transitEstimate.unavailable,
                isScheduleAware: transitEstimate.isScheduleAware,
                durationMinutes: transitEstimate.durationMinutes,
                departureTimeIso: transitEstimate.departureTimeIso,
                arrivalTimeIso: transitEstimate.arrivalTimeIso,
                transferCount: transitEstimate.transferCount,
                walkMinutes: transitEstimate.walkMinutes,
                waitMinutes: transitEstimate.waitMinutes,
                transitLegs: Array.isArray(transitEstimate.transitLegs) ? transitEstimate.transitLegs : [],
              },
            };
          }))
          : result;

        if (Array.isArray(result?.unscheduledStops)) {
          itineraryWithTransitDetails.unscheduledStops = result.unscheduledStops;
        }

        setItinerary(itineraryWithTransitDetails);
        setScheduleRecenterKey((previous) => previous + 1);
        setWindows(prev => ({ ...prev, itinerary: true }));

        if (itineraryWithTransitDetails.length >= 2) {
          const origin = itineraryWithTransitDetails[0];
          const destination = itineraryWithTransitDetails[itineraryWithTransitDetails.length - 1];
          const middleStops = itineraryWithTransitDetails.slice(1, -1);
          const routeDateTime = routeStartDateTime;

          const routedEstimate = await getRouteEstimate({
            origin,
            destination,
            locations: middleStops,
            travelMethod: method,
            dateTime: routeDateTime,
          });

          setRouteEndpoints({ origin, destination, source: 'itinerary-optimization' });
          setRouteEstimate(routedEstimate);
        }
      } catch (error) {
        console.error('Could not optimize and route itinerary:', error);
      } finally {
        setIsOptimizing(false);
      }
    }, 1200);
  };

  const handleItineraryUpdate = (updatedItinerary) => {
    setItinerary(updatedItinerary);
  };

  const isLocationSaved = (location) => {
    const targetKey = toLocationKey(location);
    return customNodes.some((node) => toLocationKey(node) === targetKey);
  };

  const saveLocationAsSavedLocation = (location) => {
    const normalized = normalizeLocation(location, 'custom');
    if (!normalized) return;

    let createdSavedLocation = null;

    setCustomNodes((prev) => {
      const alreadySaved = prev.some((node) => toLocationKey(node) === toLocationKey(normalized));
      if (alreadySaved) return prev;

      const savedLocation = {
        ...normalized,
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        source: 'custom',
      };

      createdSavedLocation = savedLocation;

      return [...prev, savedLocation];
    });

    if (!createdSavedLocation) return;

    // Link matching trip entries so later saved-node renames propagate correctly.
    setLocations((prev) => prev.map((item) => {
      if (toLocationKey(item) !== toLocationKey(normalized)) {
        return item;
      }

      return {
        ...item,
        linkedCustomNodeId: createdSavedLocation.id,
      };
    }));
  };

  return (
    <div className="h-screen w-screen bg-bg-deep overflow-hidden relative">
      {/* Background Layer: Map — full screen, behind everything */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <MapDisplay
          itinerary={itinerary}
          routeGeometry={routeEstimate?.geometry || []}
          origin={selectedStartLocation || routeEndpoints.origin}
          destination={selectedDestinationLocation || routeEndpoints.destination}
          focusTarget={mapFocusTarget}
          recenterTrigger={scheduleRecenterKey}
          customNodes={customNodes}
          pois={pois}
          onMapContextMenu={(payload) => {
            setMapContextMenu({
              visible: true,
              x: payload.x,
              y: payload.y,
              lat: payload.lat,
              lng: payload.lng,
              sourceType: payload.sourceType || 'map',
              sourceId: payload.sourceId || null,
              sourceName: payload.sourceName || '',
              sourceAddress: payload.sourceAddress || '',
              sourceOpeningHours: payload.sourceOpeningHours || null,
              sourceOpeningHoursText: payload.sourceOpeningHoursText || '',
            });
          }}
          onMapClick={() => setMapContextMenu(prev => ({ ...prev, visible: false }))}
        />
      </div>

      {mapContextMenu.visible && (
        <div
          className="glass-panel p-2 text-xs font-bold"
          style={{
            zIndex: 1200,
            position: 'absolute',
            left: mapContextMenu.x,
            top: mapContextMenu.y,
            minWidth: 220,
          }}
        >
          <button
            className="w-full text-left px-3 py-2 hover:bg-white/10 rounded-lg"
            onClick={async () => {
              const context = { ...mapContextMenu };
              let resolvedAddress = String(context.sourceAddress || '').trim();

              if (!resolvedAddress && context.sourceType !== 'poi') {
                const reverseResult = await reverseGeocodeLocation({ lat: context.lat, lng: context.lng });
                resolvedAddress = String(reverseResult?.address || '').trim();
              }

              const location = context.sourceType === 'poi'
                ? normalizeLocation({
                    id: context.sourceId,
                    name: context.sourceName,
                    lat: context.lat,
                    lng: context.lng,
                    address: resolvedAddress,
                    openingHours: context.sourceOpeningHours,
                    openingHoursText: context.sourceOpeningHoursText,
                  }, 'poi')
                : {
                    ...createCustomLocation({
                      name: context.sourceName || `Map Pin (${context.lat.toFixed(4)}, ${context.lng.toFixed(4)})`,
                      lat: context.lat,
                      lng: context.lng,
                    }),
                    address: resolvedAddress,
                  };

              if (!location) return;

              if (context.sourceType !== 'poi') {
                setCustomNodes(prev => {
                  const exists = prev.some(item => item.id === location.id);
                  return exists ? prev : [...prev, location];
                });
              }

              addLocationToTrip(location);
              if (!selectedStartId) setSelectedStartId(location.id);
              else if (!selectedDestinationId) setSelectedDestinationId(location.id);

              setMapContextMenu(prev => ({ ...prev, visible: false }));
            }}
          >
            Set Location
          </button>
          <button
            className="w-full text-left px-3 py-2 hover:bg-white/10 rounded-lg"
            onClick={() => {
              setCustomNodeDraft({
                open: true,
                lat: mapContextMenu.lat,
                lng: mapContextMenu.lng,
                name: '',
                note: '',
              });
              setMapContextMenu(prev => ({ ...prev, visible: false }));
            }}
          >
            Create Saved Location Here
          </button>
        </div>
      )}

      {customNodeDraft.open && (
        <div
          className="glass-panel p-4 space-y-3"
          style={{ position: 'absolute', bottom: 90, left: 20, zIndex: 1200, width: 320 }}
        >
          <p className="text-xs font-black uppercase tracking-wider text-text-muted">Create Saved Location</p>
          <p className="text-[11px] text-text-muted">{customNodeDraft.lat?.toFixed(6)}, {customNodeDraft.lng?.toFixed(6)}</p>
          <input
            value={customNodeDraft.name}
            onChange={(e) => setCustomNodeDraft(prev => ({ ...prev, name: e.target.value }))}
            className="w-full bg-bg-deep border border-border-glass rounded-xl py-2.5 px-3 text-sm outline-none"
            placeholder="Location name"
          />
          <input
            value={customNodeDraft.note}
            onChange={(e) => setCustomNodeDraft(prev => ({ ...prev, note: e.target.value }))}
            className="w-full bg-bg-deep border border-border-glass rounded-xl py-2.5 px-3 text-sm outline-none"
            placeholder="Optional note"
          />
          <div className="flex gap-2">
            <button
              className="flex-1 bg-primary hover:bg-primary-hover py-2.5 rounded-xl text-xs font-bold"
              onClick={async () => {
                const reverseResult = await reverseGeocodeLocation({ lat: customNodeDraft.lat, lng: customNodeDraft.lng });
                const created = {
                  ...createCustomLocation({
                  name: customNodeDraft.name,
                  lat: customNodeDraft.lat,
                  lng: customNodeDraft.lng,
                  note: customNodeDraft.note,
                  }),
                  address: String(reverseResult?.address || '').trim(),
                };
                setCustomNodes(prev => [...prev, created]);
                addLocationToTrip(created);
                setCustomNodeDraft({ open: false, lat: null, lng: null, name: '', note: '' });
              }}
            >
              Save Location
            </button>
            <button
              className="flex-1 bg-white/5 hover:bg-white/10 py-2.5 rounded-xl text-xs font-bold border border-border-glass"
              onClick={() => setCustomNodeDraft({ open: false, lat: null, lng: null, name: '', note: '' })}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* All UI sits above the map via explicit z-index */}

      {/* Header Area */}
      <div className="absolute top-6 left-6" style={{ zIndex: 400 }}>
        <div
          className="glass-panel p-3 border-primary/20 bg-primary/10"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap' }}
        >
          <div className="bg-primary p-2 rounded-xl shadow-lg shadow-primary/30">
            <Compass className="text-white" size={24} />
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'nowrap' }}>
            <h1 className="text-lg font-black tracking-tight leading-none">TripOptimizer</h1>
            <span className="text-xs font-bold text-text-muted flex items-center gap-1.5">
              <MapPin size={14} className="text-primary" />
              {`${pois.length} POIs`}
            </span>
          </div>
        </div>
      </div>

      {/* Windows Layer — zIndex 500+ so they sit above Leaflet panes */}
      <div style={{ position: 'relative', zIndex: 500, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'all' }}>
          <TripFormWindow
            isOpen={windows.search}
            onClose={() => toggleWindow('search')}
            onMinimize={() => toggleWindow('search')}
            locations={locations}
            travelMethod={travelMethod}
            setTravelMethod={setTravelMethod}
            onAddLocation={addLocationToTrip}
            onRemoveLocation={removeLocationFromTrip}
            onOptimize={handleOptimize}
            optimizerMode={optimizerMode}
            onOptimizerModeChange={setOptimizerMode}
            timeBudgetMinutes={timeBudgetMinutes}
            onTimeBudgetMinutesChange={setTimeBudgetMinutes}
            onUpdateLocationPriority={updateTripLocationPriority}
            onUpdateLocationDuration={updateTripLocationDuration}
            onUpdateLocationOpeningHours={updateTripLocationOpeningHours}
            routeEstimate={routeEstimate}
            pois={pois}
            customNodes={customNodes}
            selectedStartId={selectedStartId}
            selectedDestinationId={selectedDestinationId}
            onSetStart={handleSelectStart}
            onSetDestination={handleSelectDestination}
            onEditLocation={updateCustomNode}
            onDeleteLocation={deleteCustomNode}
            onSaveLocation={saveLocationAsSavedLocation}
            isLocationSaved={isLocationSaved}
            tripDate={tripDate}
            onTripDateChange={setTripDate}
            tripStartDate={tripStartDate}
            tripEndDate={tripEndDate}
            tripStartTime={tripStartTime}
            tripEndTime={tripEndTime}
            wakeTime={wakeTime}
            sleepTime={sleepTime}
            onTripStartDateChange={setTripStartDate}
            onTripEndDateChange={setTripEndDate}
            onTripStartTimeChange={setTripStartTime}
            onTripEndTimeChange={setTripEndTime}
          />

          <ItineraryWindow
            itinerary={itinerary}
            travelMethod={itineraryTravelMethod}
            tripDate={tripDate}
            onItineraryUpdate={handleItineraryUpdate}
            isOpen={windows.itinerary}
            onClose={() => toggleWindow('itinerary')}
            onMinimize={() => toggleWindow('itinerary')}
          />

          {windows.settings && (
          <WindowWrapper
            title="Settings"
            icon={Settings}
            onClose={() => toggleWindow('settings')}
            onMinimize={() => toggleWindow('settings')}
            style={{ top: '140px', right: '20px', width: '360px', maxHeight: '70vh' }}
          >
            <div className="space-y-4 text-sm">
              <div className="glass-card p-3">
                <p className="text-xs font-black uppercase tracking-wider text-text-muted">Time Constrained Mode</p>
                <div className="mt-2 space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Daily availability</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="time"
                        value={wakeTime}
                        onChange={(e) => setWakeTime(e.target.value)}
                        className="w-full bg-bg-deep border border-border-glass rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                        aria-label="Wake time"
                      />
                      <input
                        type="time"
                        value={sleepTime}
                        onChange={(e) => setSleepTime(e.target.value)}
                        className="w-full bg-bg-deep border border-border-glass rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                        aria-label="Sleep time"
                      />
                    </div>
                    <p className="text-[11px] text-text-muted">Used to compute available planning minutes for Time Constrained Mode.</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Break time between locations (minutes)</label>
                    <input
                      type="number"
                      min={0}
                      max={180}
                      step={5}
                      value={breakTimeMinutes}
                      onChange={(e) => {
                        const next = Math.min(180, Math.max(0, Math.round(Number(e.target.value) || 0)));
                        setBreakTimeMinutes(next);
                      }}
                      className="w-full bg-bg-deep border border-border-glass rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                    />
                    <p className="text-[11px] text-text-muted">Applied directly to optimizer as per-stop buffer time.</p>
                  </div>
                </div>
              </div>
              <div className="glass-card p-3">
                <p className="text-xs font-black uppercase tracking-wider text-text-muted">Current Mode</p>
                <p className="mt-2 text-xs text-text-muted">
                  {optimizerMode === 'time-constrained-fit'
                    ? 'Time Constrained Mode is active. Break time will affect schedule feasibility and budget usage.'
                    : 'Switch to Time Constrained Mode in Plan Trip to use these settings during optimization.'}
                </p>
              </div>
              <div className="glass-card p-3">
                <p className="text-xs font-black uppercase tracking-wider text-text-muted">Transit Provider</p>
                <div className="mt-2 space-y-3">
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-border-glass bg-white/5 px-3 py-2.5 cursor-pointer">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Use mock transit</p>
                      <p className="text-[11px] text-text-muted">Disable this to query a real OTP server for schedule-aware transit data.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={useMockTransit}
                      onChange={(e) => setUseMockTransit(e.target.checked)}
                      className="h-4 w-4 accent-primary"
                      aria-label="Use mock transit"
                    />
                  </label>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">OTP base URL</label>
                    <input
                      type="url"
                      value={otpBaseUrl}
                      onChange={(e) => setOtpBaseUrl(e.target.value)}
                      placeholder="http://localhost:8080 or http://localhost:8080/otp"
                      className="w-full bg-bg-deep border border-border-glass rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                      spellCheck={false}
                    />
                    <p className="text-[11px] text-text-muted">
                      Runtime override stored in browser storage. Use the OTP deployment base URL; the app appends the router path automatically. Current source: {useMockTransit ? 'mock transit enabled' : 'browser setting or default OTP URL'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="glass-card p-3">
                <p className="text-xs font-black uppercase tracking-wider text-text-muted">Saved Locations Persistence</p>
                <p className="mt-2 text-[11px] text-text-muted">Saved locations persist in local browser storage and are restored on app load.</p>
              </div>
            </div>
          </WindowWrapper>
          )}
        </div>
      </div>

      {/* App Dock */}
      <div className="app-dock" style={{ zIndex: 500 }}>
        <div
          className={`dock-item ${windows.search ? 'active' : ''}`}
          onClick={() => toggleWindow('search')}
          title="Plan Trip"
        >
          <Search size={22} />
        </div>
        <div
          className={`dock-item ${windows.itinerary ? 'active' : ''}`}
          onClick={() => toggleWindow('itinerary')}
          title="Itinerary"
        >
          <CalendarCheck size={22} />
        </div>
        <div
          className={`dock-item ${windows.settings ? 'active' : ''}`}
          onClick={() => toggleWindow('settings')}
          title="Settings"
        >
          <Settings size={22} />
        </div>
      </div>

      {/* Loading Overlay */}
      {isOptimizing && (
        <div className="fixed inset-0 bg-bg-deep/40 backdrop-blur-md flex flex-col items-center justify-center" style={{ zIndex: 1000 }}>
          <div className="relative">
            <div className="w-20 h-20 border-4 border-primary/20 rounded-full"></div>
            <div className="absolute inset-0 w-20 h-20 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="mt-6 font-black text-xl tracking-widest uppercase animate-pulse">
            Computing Itinerary
          </p>
          <p className="text-text-muted text-sm mt-2">
            Running TSP-TW heuristic algorithms...
          </p>
        </div>
      )}

    </div>
  );
}

export default App;
