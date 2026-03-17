# Architecture Overview

## Stack
- React + Vite
- Leaflet (`react-leaflet`) in the current implementation
- Lucide icons
- `html2canvas` + `jspdf`

## Provider status

- Current implementation: Leaflet map rendering, Mapbox-backed road routing, Nominatim external geosearch, and OTP-backed transit/runtime support.
- Paid target: Google Maps Platform for map rendering, route estimation, places/autocomplete, and geocoding.

## Core modules
- `src/main.jsx`: app entry.
- `src/App.jsx`: state orchestration.
- `src/components/TripFormWindow.jsx`: trip input and actions.
- `src/components/MapDisplay.jsx`: map rendering and geometry display.
- `src/components/ItineraryWindow.jsx`: itinerary output and export.
- `src/services/nominatim.js`: current external geosearch fallback, expected to be replaced or wrapped during Google migration.
- `src/services/mapboxRouting.js`: current normalized route estimate service, expected to be split or replaced during Google migration.
- `src/platform/desktop/otpDesktop.js`: current desktop bridge for OTP runtime controls.
- `electron/main.cjs`: current Electron runtime that still contains managed OTP process logic.
- `src/utils/tspSolver.js`: optimization logic.
- `public/london-pois.json`: local POI data source.

## Data flow
1. **POI overlay**: app startup -> load local POI JSON -> render map markers.
2. **Search**: local index (POIs + custom nodes) -> bounded external geosearch fallback -> merged ranked results.
3. **Route estimate**: planner action -> provider-facing routing service -> geometry rendered on map.
4. **Schedule optimize**: planner action -> solver output -> itinerary + polyline update.

## Migration touchpoints

- `src/components/MapDisplay.jsx`: primary renderer swap point because it currently depends directly on Leaflet containers, markers, and polylines.
- `src/App.jsx`: provider orchestration seam because it imports the current route service, OTP desktop helpers, and reverse-geocoding helper directly.
- `src/services/mapboxRouting.js`: current mixed provider module that should become a provider-neutral contract plus Google-specific implementation.
- `src/services/nominatim.js`: current external lookup module that should become a Google geocoding and places adapter or fallback wrapper.
- `src/platform/desktop/otpDesktop.js` and `electron/main.cjs`: OTP-specific desktop surfaces that should be hidden, reduced, or removed from the paid build once the Google path is complete.

## Target paid architecture

1. Keep `src/App.jsx`, trip-planning windows, and optimization logic as the stable orchestration layer.
2. Replace direct provider imports with provider-neutral service boundaries for map, routing, and external lookup.
3. Migrate `MapDisplay.jsx` from Leaflet-specific rendering to a Google-backed map implementation while preserving the existing props contract where practical.
4. Remove OTP runtime ownership from the paid desktop shell after provider-backed routing no longer depends on local infrastructure.
