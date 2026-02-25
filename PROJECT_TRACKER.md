# TripOptimizer Project Tracker

Last updated: 2026-02-25
Owner: Team

## 1) Why this file exists
This file tracks:
- what the app does today,
- what is missing,
- what we are building next,
- and progress against the agreed plan.

Use this as the single handoff document for entry-level engineers.

---

## 2) Current app behavior (today)

### What works now
1. App opens with a full-screen Leaflet map of London, Ontario.
2. It loads `public/london-pois.json` and renders POI dots on the map.
3. User can search places from the Plan Trip panel (search currently uses Nominatim, global search).
4. User can add search results into a `Locations` list.
5. User can click:
   - **Optimize Schedule** (local heuristic TSP solver), and
   - **Estimate Route Time** (Mapbox Directions API or mock fallback).
6. App draws either itinerary polyline or route geometry on map.
7. Itinerary panel can export to JPG/PDF.

### What does NOT work yet (known gaps)
- No right-click map menu.
- No way to set Start/Destination directly from map click.
- No “create custom location/node” flow.
- No persistence for custom locations.
- Search is not local-first (does not prioritize your 3031 London POIs).
- No saved-node CRUD UI.

---

## 3) Architecture overview (entry-level)

### Frontend stack
- React + Vite
- Leaflet (`react-leaflet`) for map rendering
- Lucide icons
- `html2canvas` + `jspdf` for itinerary exports

### Important files
- `src/main.jsx` → app entry point.
- `src/App.jsx` → top-level state + wiring between map and windows.
- `src/components/TripFormWindow.jsx` → search, location list, optimize/estimate buttons.
- `src/components/MapDisplay.jsx` → map tiles, POI dots, markers, route line.
- `src/components/ItineraryWindow.jsx` → itinerary timeline + export actions.
- `src/services/nominatim.js` → global place search (current search backend).
- `src/services/mapboxRouting.js` → route time/path (real Mapbox + mock mode).
- `src/utils/tspSolver.js` → local TSP-with-time-windows optimizer.
- `public/london-pois.json` → local POI dataset currently displayed on map.

---

## 4) Data flow (simple)

### A) POI overlay
`App` fetches `london-pois.json` on load → passes `pois` to `MapDisplay` → `MapDisplay` renders `CircleMarker` dots.

### B) Search and location list
`TripFormWindow` input change → calls `searchLocations(query)` in `nominatim.js` → shows dropdown results → selected item added to in-panel `locations` state.

### C) Route estimate
`TripFormWindow` click “Estimate Route Time” → `App.handleEstimateRoute(locations, method)` → `mapboxRouting.getRouteEstimate(...)`:
- uses mock route when `VITE_USE_MOCK_ROUTING !== 'false'`,
- otherwise calls Mapbox Directions.
Result geometry is drawn in `MapDisplay`.

### D) Itinerary optimization
`TripFormWindow` click “Optimize Schedule” → `TSPSolver.solve()` using location list and travel method speed assumptions → results shown in `ItineraryWindow` and drawn as itinerary polyline.

---

## 5) Environment setup notes

### Local dev
```bash
npm install
npm run dev
```

### Routing modes
- Real Mapbox mode:
  - `VITE_USE_MOCK_ROUTING=false`
  - `VITE_MAPBOX_ACCESS_TOKEN=...`
- Mock mode:
  - `VITE_USE_MOCK_ROUTING=true`

Current local setup uses `.env.local`.

---

## 6) Plan and progress status

Legend:
- `DONE` = implemented and usable
- `PARTIAL` = some foundation exists but not full workflow
- `TODO` = not implemented

1. Define location data model — **PARTIAL**
   - There is an implicit object shape (`id, name, lat, lng, openingHours, duration`) but no centralized type/schema.
2. Add map context menu actions — **TODO**
3. Support click-to-create custom nodes — **TODO**
4. Persist custom nodes locally — **TODO**
5. Build local POI search index — **TODO**
6. Prioritize London-only search results — **TODO**
7. Add start/destination selectors — **PARTIAL**
   - Start/destination are inferred from first/last selected locations, not explicitly user-selected.
8. Route from selected endpoints — **PARTIAL**
   - Routing works for first/last list items, but not from map context menu/custom node selection.
9. Show/edit/delete saved nodes — **TODO**
10. Document UX and settings — **PARTIAL**
   - Basic README exists, but this tracker is the first complete functional documentation.

---

## 7) Suggested implementation order (next)

### Phase 1: Core interaction primitives
- Add a central `Location` model helper (normalization + validation).
- Add map context menu and map-click handlers.
- Add explicit Start/Destination assignment state in `App`.

### Phase 2: Custom node workflow
- Create custom node form (name/category/note from clicked lat/lng).
- Save/edit/delete custom nodes in `localStorage`.
- Render custom nodes with a distinct marker style.

### Phase 3: Search quality
- Build local POI search (from `london-pois.json`) and custom node search.
- Use local-first ranking; fallback to Nominatim/Mapbox geocoding if no good local matches.
- Bias/limit external search to London region.

### Phase 4: Routing integration polish
- Route based on explicit Start/Destination picks (from map, search, or saved nodes).
- Show route source labels (POI/custom/external).
- Improve error and empty-state messages.

---

## 8) Quick onboarding checklist for new engineers
- Read this file fully once.
- Run app locally and verify map + plan window appears.
- Confirm POI count badge shows around 3031.
- Add 2 places via search and test:
  - Estimate Route Time
  - Optimize Schedule
- Open `App.jsx`, `TripFormWindow.jsx`, `MapDisplay.jsx` together to understand state flow.

---

## 9) Change log
- 2026-02-25:
  - Mapbox routing service integrated with mock/real modes.
  - POI overlay restored (3031 dots from `london-pois.json`).
  - This tracker created for plan + progress + onboarding.
