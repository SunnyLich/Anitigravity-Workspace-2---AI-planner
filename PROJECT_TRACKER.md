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
3. User can search places from the Plan Trip panel with local-first behavior (local POIs + custom nodes first, then London-bounded Nominatim fallback).
4. User can add search results into a `Locations` list.
5. User can click:
   - **Optimize Schedule** (local heuristic TSP solver), and
   - **Estimate Route Time** (Mapbox Directions API or mock fallback).
6. App draws either itinerary polyline or route geometry on map.
7. Itinerary panel can export to JPG/PDF.
8. User can right-click on map to:
   - set Location
   - create a custom location at clicked coordinates.
9. Custom nodes are saved in `localStorage` and reloaded on refresh.
10. User can explicitly choose Start/Destination from selectors, and route estimation uses these selected endpoints.
11. Saved custom nodes can be shown, renamed, deleted, and added into the trip list.
12. Session state persists across refresh (trip locations, travel method, selected start/destination, and custom nodes).
13. Route estimation now includes all trip locations (not only start/destination); multi-stop optimization is attempted via Mapbox Optimization API with fallback strategies.

### What does NOT work yet (known gaps)
#### Simple
- Selected travel method should be highlighted
- right click on a POI and clicking set location(replacing set start/destination) should uses the location and name of the POI, right now its using name "map pin 'coordinate'". And the trash bin icon should not by default sit on the next line of the name, but on the same line
- Allow the user to hide the saved custom nodes.
- Use 5 different lines for "routing endpoints", "start", the 2 drop down menu and "destination" 

#### More Complex (for each of them details are to be asked and decided)
- Show more meaningful information (to average users) on POI if they exist. 
- Route quality still depends on provider mode (`mock` vs real `mapbox`), so mock mode is not road-accurate. Replace with OSRM for now.
- Search ranking is still basic substring matching (no fuzzy scoring/index weighting yet).
- Custom node editor currently supports rename only (note/category editing not yet surfaced).
- No dedicated settings/help panels yet.

#### Endgame
- Use mapbox for routing
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
`TripFormWindow` input change → local ranked index search runs first (`pois + customNodes`) → if needed, London-bounded Nominatim fallback is queried → merged results shown → selected item added to trip `locations` state.

### C) Route estimate
`TripFormWindow` click “Estimate Route Time” → `App.handleEstimateRoute(locations, method)` → `mapboxRouting.getRouteEstimate(...)`:
- uses mock route when `VITE_USE_MOCK_ROUTING !== 'false'`,
- otherwise calls Mapbox Optimization API for multi-stop route ordering when possible, with Directions API fallback.
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
   - ✅ `src/utils/locationModel.js` now centralizes location normalization, custom-node creation, and deduping.
2. Add map context menu actions — **DONE**
3. Support click-to-create custom nodes — **DONE**
4. Persist custom nodes locally — **DONE**
5. Build local POI search index — **DONE**
   - ✅ `src/utils/localSearch.js` now builds a local index and scores/ranks local matches.
6. Prioritize London-only search results — **DONE**
   - ✅ External fallback is London-bounded and London-hinted results are prioritized in ranking.
7. Add start/destination selectors — **DONE**
8. Route from selected endpoints — **DONE**
9. Show/edit/delete saved nodes — **DONE**
10. Document UX and settings — **PARTIAL**
   - Tracker is updated, but in-app settings/help UX is still not implemented.

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
   - Added right-click map context menu for Start, Destination, and custom-node creation.
   - Added explicit Start/Destination selectors in Plan Trip panel.
   - Added `localStorage` persistence for custom nodes.
   - Added local-first search with London-bounded external fallback.
   - Added saved custom node list with rename/delete/use actions.
   - Added persisted trip session state (trip list, travel method, selected endpoints).
   - Added dedicated local search index utility with relevance scoring.
