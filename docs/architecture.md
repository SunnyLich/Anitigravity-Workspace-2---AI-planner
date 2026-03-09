# Architecture Overview

## Stack
- React + Vite
- Leaflet (`react-leaflet`)
- Lucide icons
- `html2canvas` + `jspdf`

## Core modules
- `src/main.jsx`: app entry.
- `src/App.jsx`: state orchestration.
- `src/components/TripFormWindow.jsx`: trip input and actions.
- `src/components/MapDisplay.jsx`: map rendering and geometry display.
- `src/components/ItineraryWindow.jsx`: itinerary output and export.
- `src/services/nominatim.js`: external geosearch fallback.
- `src/services/mapboxRouting.js`: route estimate and geometry.
- `src/utils/tspSolver.js`: optimization logic.
- `public/london-pois.json`: local POI data source.

## Data flow
1. **POI overlay**: app startup -> load local POI JSON -> render map markers.
2. **Search**: local index (POIs + custom nodes) -> bounded Nominatim fallback -> merged ranked results.
3. **Route estimate**: planner action -> routing service -> geometry rendered on map.
4. **Schedule optimize**: planner action -> solver output -> itinerary + polyline update.
