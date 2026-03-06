# TripOptimizer App Communication Guide

This document explains how files communicate in this project and where each piece of logic lives.

## 1) High-level architecture

The app follows a **single-state-owner pattern**:

- `src/App.jsx` is the orchestration layer and owns most global UI + trip state.
- `src/components/*.jsx` are mostly presentation + interaction surfaces.
- `src/services/*.js` handle external/network route and geocoding calls.
- `src/utils/*.js` handle normalization, local search scoring, POI loading, and TSP solving.

Entry point:

- `src/main.jsx` mounts `<App />`.

## 2) File responsibilities

### `src/App.jsx` (state + coordination)

Owns and coordinates:

- Trip session state: `locations`, `travelMethod`, `tripDate`, selected endpoints.
- Optimization outputs: `itinerary`, `routeEstimate`, `routeEndpoints`.
- Map interaction state: context menu, map focus target, custom node draft.
- Persistence: reads/writes `localStorage` keys for custom nodes, trip locations, travel method, selected endpoints.
- Cross-window behavior: toggles `TripFormWindow` and `ItineraryWindow`.

Important callbacks created in `App.jsx` and passed down:

- Trip list operations: `addLocationToTrip`, `removeLocationFromTrip`.
- Saved/custom locations: `updateCustomNode`, `deleteCustomNode`, `saveLocationAsSavedLocation`.
- Routing + optimization: `handleOptimize`.
- Endpoint selection: `setSelectedStartId`, `setSelectedDestinationId`.

### `src/components/TripFormWindow.jsx` (trip planning UI)

Consumes props from `App.jsx` and emits user intents upward:

- Search input → runs local search first, then external Nominatim fallback.
- Add/remove trip locations through `onAddLocation` / `onRemoveLocation`.
- Save a location into saved locations through `onSaveLocation`.
- Start/destination selectors call `onSetStart` / `onSetDestination`.
- Optimize button calls `onOptimize(locations, travelMethod, tripDate)`.

It also merges `locations + customNodes` for endpoint dropdowns and dedupes display choices.

### `src/components/MapDisplay.jsx` (map rendering + map events)

Receives map data props and renders:

- Itinerary markers/polylines.
- Route geometry overlay (from routing estimate).
- POI markers and custom node markers.
- Start/destination markers.

Emits map interaction events upward:

- Right-click/context payload via `onMapContextMenu`.
- Map click via `onMapClick`.

`App.jsx` handles these events to open map context menu and create/add locations.

### `src/components/ItineraryWindow.jsx` (itinerary editing/export)

Receives itinerary from `App.jsx`, allows time edits, and emits updates:

- `onItineraryUpdate(updatedItinerary)` is called when arrival/departure edits shift downstream stops.
- Export actions (JPG/PDF) happen locally in this component.

### Services

- `src/services/nominatim.js`: external location search.
- `src/services/mapboxRouting.js`: route estimation (mock or Mapbox API).

### Utils

- `src/utils/locationModel.js`: normalization, dedupe, custom-location creation.
- `src/utils/localSearch.js`: index build + query scoring across POIs/custom nodes.
- `src/utils/poiLoader.js`: eager-loads all POI JSON under `src/data/pois`.
- `src/utils/tspSolver.js`: heuristic schedule generator for TSP + time windows.

## 3) Main communication flows

## A. Search → add location flow

1. User types in `TripFormWindow` search box.
2. `TripFormWindow` calls `searchLocalIndex(...)` first.
3. If fewer than needed results, `searchLocations(...)` (Nominatim) is called.
4. Results are normalized/deduped/scored.
5. User clicks a result → `onAddLocation(result, { focusOnMap: true })`.
6. `App.jsx` normalizes and appends to `locations` (dedupe by id), optionally focuses map.

## B. Optimize flow (trip schedule + route estimate)

1. User clicks **Optimize Schedule** in `TripFormWindow`.
2. `onOptimize` invokes `App.jsx` `handleOptimize(...)`.
3. `TSPSolver.solve()` produces ordered itinerary with times.
4. `App.jsx` opens `ItineraryWindow` and stores itinerary.
5. For first/last itinerary stops, `getRouteEstimate(...)` is called.
6. `routeEstimate.geometry` is passed to `MapDisplay` for gradient route lines.

## C. Map context-menu flow

1. User right-clicks map or POI in `MapDisplay`.
2. `MapDisplay` emits context payload (`lat/lng`, source type, source id/name).
3. `App.jsx` opens map context menu state.
4. User chooses action:
   - **Set Location** → create/normalize location, add to trip, set start/destination when empty.
   - **Create Saved Location Here** → opens draft form and saves into `customNodes`.

## D. Itinerary edit flow

1. User edits arrival/departure time in `ItineraryWindow`.
2. Component computes delta and shifts downstream times.
3. Calls `onItineraryUpdate(updated)`.
4. `App.jsx` replaces itinerary state.
5. `MapDisplay` immediately reflects updated itinerary data.

## E. Persistence flow (localStorage)

On app load, `App.jsx` restores:

- Custom nodes
- Trip locations
- Travel method
- Selected start/destination

On changes, dedicated effects persist each state slice back to storage.

## 4) Key design principle in this codebase

Most communication is **top-down props + bottom-up callbacks**:

- Downward: `App.jsx` passes state into windows/map.
- Upward: components emit user intents via callbacks.
- Side effects (network/storage/solver) are centralized in `App.jsx` and service/utils modules.

This keeps UI components relatively thin and makes communication paths easy to trace from `App.jsx`.

## 5) Quick trace map (where to start reading next time)

1. `src/main.jsx` → app entry.
2. `src/App.jsx` → state + callback wiring.
3. `src/components/TripFormWindow.jsx` → search/add/optimize UI flow.
4. `src/components/MapDisplay.jsx` → map event output + route rendering.
5. `src/components/ItineraryWindow.jsx` → itinerary mutation + export.
6. `src/services/*` + `src/utils/*` → pure logic and external calls.
