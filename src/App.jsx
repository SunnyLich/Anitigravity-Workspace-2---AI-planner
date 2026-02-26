import React, { useState, useEffect } from 'react';
import { Compass, Search, CalendarCheck, Settings, Info, Map as MapIcon } from 'lucide-react';
import { TripFormWindow } from './components/TripFormWindow';
import ItineraryWindow from './components/ItineraryWindow';
import MapDisplay from './components/MapDisplay';
import { TSPSolver } from './utils/tspSolver';
import { getRouteEstimate } from './services/mapboxRouting';
import { createCustomLocation, normalizeLocation } from './utils/locationModel';

const CUSTOM_NODES_STORAGE_KEY = 'tripoptimizer.customNodes';
const TRIP_LOCATIONS_STORAGE_KEY = 'tripoptimizer.tripLocations';
const SELECTED_ENDPOINTS_STORAGE_KEY = 'tripoptimizer.selectedEndpoints';
const TRAVEL_METHOD_STORAGE_KEY = 'tripoptimizer.travelMethod';

function App() {
  const [locations, setLocations] = useState([]);
  const [itinerary, setItinerary] = useState([]);
  const [travelMethod, setTravelMethod] = useState('walk');
  const [itineraryTravelMethod, setItineraryTravelMethod] = useState('walk');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isRouting, setIsRouting] = useState(false);
  const [routingStatusMessage, setRoutingStatusMessage] = useState('Waiting...');
  const [routingElapsedSeconds, setRoutingElapsedSeconds] = useState(0);
  const [routeEstimate, setRouteEstimate] = useState(null);
  const [routeEndpoints, setRouteEndpoints] = useState({ origin: null, destination: null, source: null });
  const [selectedStartId, setSelectedStartId] = useState('');
  const [selectedDestinationId, setSelectedDestinationId] = useState('');
  const [customNodes, setCustomNodes] = useState([]);
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
  });
  const [customNodeDraft, setCustomNodeDraft] = useState({ open: false, lat: null, lng: null, name: '', note: '' });

  // Window Visibility State
  const [windows, setWindows] = useState({
    search: true,
    itinerary: false,
    settings: false,
    info: false
  });

  useEffect(() => {
    fetch('/london-pois.json')
      .then(r => r.json())
      .then(data => setPois(Array.isArray(data) ? data : []))
      .catch(err => console.warn('Could not load POIs:', err));
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_NODES_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      const normalized = Array.isArray(parsed)
        ? parsed.map(item => normalizeLocation(item, 'custom')).filter(Boolean)
        : [];

      setCustomNodes(normalized);
    } catch (error) {
      console.warn('Could not load custom nodes from storage:', error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_NODES_STORAGE_KEY, JSON.stringify(customNodes));
    } catch (error) {
      console.warn('Could not save custom nodes:', error);
    }
  }, [customNodes]);

  useEffect(() => {
    try {
      const rawLocations = localStorage.getItem(TRIP_LOCATIONS_STORAGE_KEY);
      const rawTravelMethod = localStorage.getItem(TRAVEL_METHOD_STORAGE_KEY);
      const rawEndpoints = localStorage.getItem(SELECTED_ENDPOINTS_STORAGE_KEY);

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
      localStorage.setItem(
        SELECTED_ENDPOINTS_STORAGE_KEY,
        JSON.stringify({ selectedStartId, selectedDestinationId })
      );
    } catch (error) {
      console.warn('Could not save selected endpoints:', error);
    }
  }, [selectedStartId, selectedDestinationId]);

  useEffect(() => {
    if (!isRouting) {
      setRoutingElapsedSeconds(0);
      return undefined;
    }

    const startedAt = Date.now();
    const intervalId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setRoutingElapsedSeconds(elapsed);
    }, 250);

    return () => clearInterval(intervalId);
  }, [isRouting]);

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

  const addLocationToTrip = (rawLocation) => {
    const normalized = normalizeLocation(rawLocation, rawLocation.source || 'search');
    if (!normalized) return;

    setLocations(prev => {
      const exists = prev.some(item => item.id === normalized.id);
      if (exists) return prev;
      return [...prev, normalized];
    });
  };

  const removeLocationFromTrip = (locationId) => {
    setLocations(prev => prev.filter(item => item.id !== locationId));
  };

  const updateCustomNode = (locationId, updates) => {
    setCustomNodes(prev =>
      prev.map(item => {
        if (item.id !== locationId) return item;
        return {
          ...item,
          name: updates.name ?? item.name,
          note: updates.note ?? item.note,
        };
      })
    );
  };

  const deleteCustomNode = (locationId) => {
    setCustomNodes(prev => prev.filter(item => item.id !== locationId));
    setSelectedStartId(prev => (prev === locationId ? '' : prev));
    setSelectedDestinationId(prev => (prev === locationId ? '' : prev));
  };

  const handleOptimize = async (locations, method) => {
    setIsOptimizing(true);
    setTravelMethod(method);
    setItineraryTravelMethod(method);
    setRouteEstimate(null);
    setRoutingStatusMessage('Optimizing schedule...');

    setTimeout(async () => {
      const solver = new TSPSolver(locations, {
        travelSpeed: method === 'car' ? 40 : method === 'transit' ? 20 : 5,
        bufferTime: 15,
        startTime: "09:00"
      });

      try {
        const result = solver.solve();
        setItinerary(result);
        setWindows(prev => ({ ...prev, itinerary: true }));

        if (result.length >= 2) {
          const origin = result[0];
          const destination = result[result.length - 1];
          const middleStops = result.slice(1, -1);

          const routedEstimate = await getRouteEstimate({
            origin,
            destination,
            locations: middleStops,
            travelMethod: method,
            onStatus: (status) => setRoutingStatusMessage(status.message),
          });

          setRouteEndpoints({ origin, destination, source: 'itinerary-optimization' });
          setRouteEstimate(routedEstimate);
          setRoutingStatusMessage('Route ready.');
        }
      } catch (error) {
        console.error('Could not optimize and route itinerary:', error);
        setRoutingStatusMessage('Optimization route failed.');
      } finally {
        setIsOptimizing(false);
      }
    }, 1200);
  };

  const handleEstimateRoute = async (locations, method) => {
    const origin = selectedStartLocation || locations[0] || null;
    const destination = selectedDestinationLocation || locations[locations.length - 1] || null;

    if (!origin || !destination || origin.id === destination.id) {
      setRouteEstimate({
        provider: 'error',
        message: 'Select two different endpoints (start and destination).',
      });
      return;
    }

    setTravelMethod(method);
    setIsRouting(true);
    setRoutingStatusMessage('Preparing route request...');
    setRouteEndpoints({ origin, destination, source: 'explicit-selection' });

    try {
      const estimate = await getRouteEstimate({
        origin,
        destination,
        locations,
        travelMethod: method,
        onStatus: (status) => {
          setRoutingStatusMessage(status.message);
        },
      });
      setRoutingStatusMessage('Route ready.');
      setRouteEstimate(estimate);
    } catch (error) {
      console.error('Could not estimate route:', error);
      setRoutingStatusMessage('Route failed.');
      setRouteEstimate({
        provider: 'error',
        message: error.message || 'Could not compute route estimate.',
      });
    } finally {
      setIsRouting(false);
    }
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
            onClick={() => {
              const location = mapContextMenu.sourceType === 'poi'
                ? normalizeLocation({
                    id: mapContextMenu.sourceId,
                    name: mapContextMenu.sourceName,
                    lat: mapContextMenu.lat,
                    lng: mapContextMenu.lng,
                  }, 'poi')
                : createCustomLocation({
                    name: mapContextMenu.sourceName || `Map Pin (${mapContextMenu.lat.toFixed(4)}, ${mapContextMenu.lng.toFixed(4)})`,
                    lat: mapContextMenu.lat,
                    lng: mapContextMenu.lng,
                  });

              if (!location) return;

              if (mapContextMenu.sourceType !== 'poi') {
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
            Create Custom Location Here
          </button>
        </div>
      )}

      {customNodeDraft.open && (
        <div
          className="glass-panel p-4 space-y-3"
          style={{ position: 'absolute', bottom: 90, left: 20, zIndex: 1200, width: 320 }}
        >
          <p className="text-xs font-black uppercase tracking-wider text-text-muted">Create Custom Location</p>
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
              onClick={() => {
                const created = createCustomLocation({
                  name: customNodeDraft.name,
                  lat: customNodeDraft.lat,
                  lng: customNodeDraft.lng,
                  note: customNodeDraft.note,
                });
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
      <div className="absolute top-6 left-6 flex items-center gap-4" style={{ zIndex: 400 }}>
        <div className="glass-panel p-3 flex items-center gap-3 border-primary/20 bg-primary/10">
          <div className="bg-primary p-2 rounded-xl shadow-lg shadow-primary/30">
            <Compass className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight leading-none">TripOptimizer</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">Workspace v1.0</span>
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></div>
            </div>
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
            onEstimateRoute={handleEstimateRoute}
            routeEstimate={routeEstimate}
            isRouting={isRouting}
            routingStatusMessage={routingStatusMessage}
            routingElapsedSeconds={routingElapsedSeconds}
            pois={pois}
            customNodes={customNodes}
            selectedStartId={selectedStartId}
            selectedDestinationId={selectedDestinationId}
            onSetStart={setSelectedStartId}
            onSetDestination={setSelectedDestinationId}
            onEditCustomNode={updateCustomNode}
            onDeleteCustomNode={deleteCustomNode}
          />

          <ItineraryWindow
            itinerary={itinerary}
            travelMethod={itineraryTravelMethod}
            isOpen={windows.itinerary}
            onClose={() => toggleWindow('itinerary')}
            onMinimize={() => toggleWindow('itinerary')}
          />
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
          className="dock-item"
          title="Settings (Coming Soon)"
        >
          <Settings size={22} />
        </div>
        <div
          className="dock-item"
          title="Help"
        >
          <Info size={22} />
        </div>
      </div>

      {/* Loading Overlay */}
      {(isOptimizing || isRouting) && (
        <div className="fixed inset-0 bg-bg-deep/40 backdrop-blur-md flex flex-col items-center justify-center" style={{ zIndex: 1000 }}>
          <div className="relative">
            <div className="w-20 h-20 border-4 border-primary/20 rounded-full"></div>
            <div className="absolute inset-0 w-20 h-20 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="mt-6 font-black text-xl tracking-widest uppercase animate-pulse">
            {isOptimizing ? 'Computing Itinerary' : 'Computing Route'}
          </p>
          <p className="text-text-muted text-sm mt-2">
            {isOptimizing ? 'Running TSP-TW heuristic algorithms...' : routingStatusMessage}
          </p>
          {!isOptimizing && <p className="text-text-muted text-xs mt-1">Elapsed: {routingElapsedSeconds}s</p>}
        </div>
      )}

      {/* Floating hint */}
      <div className="absolute bottom-10 right-10" style={{ zIndex: 500 }}>
        <div className="glass-panel px-4 py-2 flex items-center gap-3 text-xs font-bold text-text-muted">
          <MapIcon size={14} className="text-primary" />
          <span>
            {`${pois.length} POIs • ${import.meta.env.VITE_USE_MOCK_ROUTING !== 'false' ? 'Mock' : 'Mapbox'} routing`}
          </span>
        </div>
      </div>
    </div>
  );
}

export default App;
