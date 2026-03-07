# TripOptimizer Project Tracker

Last updated: 2026-03-05
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
14. Plan Trip window now supports two optimization modes in the same window:
   - `Shortest Feasible`
   - `Most Wanted In Time`
15. In `Most Wanted In Time` mode, users can set a trip time budget and per-trip-location priority (1-5).
16. POI opening-hours text is now preserved into normalized location data (`openingHours` + `openingHoursText`) when adding POIs from the map context menu.

### What does NOT work yet (known gaps)
#### Simple
- Selected travel method should be identifiable


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
11. Opening-hours-aware schedule optimization — **PARTIAL**
   - Scope decided: optimizer must respect venue opening windows, include waiting/skip behavior, and expose schedule conflicts clearly in UI.
   - Baseline opening-hours parsing + POI hour preservation are implemented; full weekly rule model + conflict UI still pending.
12. Budgeted priority optimization mode — **PARTIAL**
   - New mode scope: within a user-defined total time budget, maximize completed high-priority stops while respecting opening windows.
   - Same-window mode toggle + time budget input + per-location priority controls implemented.
   - Solver now supports `max-priority-budget` greedy selection under opening-hour and budget constraints.

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

### Phase 5: Time-window scheduling
- Extend each location with richer opening metadata (weekday windows + optional closed days + optional timezone).
- Parse/normalize opening data into a canonical internal model before optimization.
- Upgrade itinerary solver to evaluate time-window feasibility and produce explicit conflict diagnostics.
- Surface "wait", "closed", and "unscheduled" statuses in itinerary UI with edit actions.

### Phase 6: Priority-with-time-budget mode
- Add a second optimization objective: maximize total priority score under total-time cap.
- Add required inputs: total time budget, optional hard-required stops, and stop priorities.
- Produce selected + dropped stop sets with reasons and score summary.
- Expose optimizer mode toggle in Trip planner UI.

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
- 2026-03-05:
   - Added a dedicated opening-hours-aware optimization plan in this tracker (section 10), including data model, solver strategy, UI behavior, and test/rollout checklist.
   - Added a dedicated budgeted-priority optimization plan (section 11) for "visit the most wanted places within a fixed time limit" workflow.
   - Implemented mode switch in the existing Plan Trip window (no separate window), with mode-specific fields.
   - Added per-trip-location user priority controls (default priority = 1).
   - Added first-pass `max-priority-budget` solver path in `TSPSolver` and wired optimize calls to pass mode + budget.
- 2026-02-26:
   - Locations list now shows address text (when available) under place name.
   - Clicking a location row in Plan Trip now pans/zooms the map to that location.
   - POI address is now preserved in normalized location data for better display/search context.
   - Removed routing status text/elapsed display from the Plan Trip panel and loading overlay per UX simplification request.
   - Removed the in-panel "Route estimate (mapbox/mock)" summary card from Plan Trip UI while keeping route rendering on the map.
   - Routed live status updates into the Plan Trip panel during route estimation.
   - Added in-panel elapsed-time display for routing progress visibility.
   - Updated Optimize Schedule to also request route geometry for the optimized itinerary so the map shows a routed path instead of only the dotted straight-line fallback.
   - Removed a decorative header status marker that could appear as a stray "-" near the top labels under certain UI scaling states.
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

---

## 10) Implementation Plan: Opening-Hours-Aware Optimization

Goal: make `Optimize Schedule` produce feasible itineraries that respect opening windows, instead of only distance/travel heuristics.

### 10.1 Functional requirements (MVP)
1. Each stop has visit duration and one or more opening windows for the selected trip date.
2. Solver can wait for opening time, but cannot schedule a visit that finishes after closing.
3. If no feasible insertion exists, stop is marked `unscheduled` with reason.
4. UI must show per-stop status: `on-time`, `wait`, `unscheduled`.
5. User can manually adjust arrival/departure and immediately see feasibility status.

### 10.2 Data model changes
1. Replace simple `openingHours: { start, end }` with:
   - `openingRules`: weekday keyed windows, example `mon: [{ start: '09:00', end: '17:00' }]`
   - `specialClosures`: optional array of closed dates
   - `timezone`: optional IANA string (default local)
2. Keep backward compatibility adapter:
   - existing `openingHours` maps to a daily single-window rule during migration.
3. Add normalized schedule fields on itinerary output:
   - `status`, `statusReason`, `windowUsed`, `slackMinutes`

### 10.3 Solver strategy (incremental)
1. Step A (MVP greedy):
   - Keep nearest-neighbor selection, but compute earliest feasible start within candidate windows for selected date.
   - Cost = travel + wait + penalty(near-close risk).
2. Step B (improvement):
   - Add local search pass (swap/2-opt-like) only if resulting schedule remains feasible.
3. Step C (future):
   - Add optional "maximize completed stops" objective when all stops cannot fit.

### 10.4 Edge-case handling rules
1. Cross-midnight windows (e.g. `18:00-02:00`) must be supported.
2. Multiple windows per day (e.g. lunch closure) must be supported.
3. Closed day or special closure must immediately mark stop unschedulable.
4. If user-selected trip date is missing, fallback to "today" with warning badge.
5. Keep times internally as absolute minutes from trip start day for multi-day continuity.

### 10.5 UI and UX updates
1. Trip planner input:
   - Add simple opening-hours editor (MVP: one window + closed toggle).
   - Add "Use POI default hours" action when source data contains hours.
2. Itinerary panel:
   - Show badges: `Wait Xm`, `Closed`, `Unscheduled`.
   - Show unscheduled section at bottom with reasons and "retry with priorities" action.
3. Optimize action:
   - Add non-blocking warning summary: `N stops unscheduled`.

### 10.6 Validation and testing checklist
1. Unit tests for time normalization helpers:
   - parsing windows, cross-midnight conversion, next-feasible-slot.
2. Solver tests:
   - all stops feasible,
   - some stops infeasible,
   - multi-window day,
   - long duration exceeding any window.
3. UI tests/manual scripts:
   - badges render correctly,
   - unscheduled list appears,
   - manual time edit updates feasibility.

### 10.7 Rollout plan
1. Milestone 1: data model adapter + helper functions (no UI change).
2. Milestone 2: solver feasibility + unscheduled output.
3. Milestone 3: itinerary badges and unscheduled section.
4. Milestone 4: trip-form opening-hours editor.
5. Milestone 5: tuning and benchmark on real London POI samples.

### 10.8 Definition of done
1. Optimizer never schedules a stop outside opening windows.
2. Unschedulable stops are explicit and actionable in UI.
3. Existing saved locations still load via backward-compatible mapping.
4. Build passes and key solver tests pass in CI/local.

---

## 11) Implementation Plan: Max-Priority Within Time Budget

Goal: add a second optimizer mode that selects and orders stops to maximize user value within a fixed trip-time budget.

### 11.1 Product behavior
1. User chooses optimization mode:
   - `Shortest Feasible Route` (existing behavior), or
   - `Most Important Places In Time Limit` (new behavior).
2. User sets total available time (example: 4h, 6h, 8h).
3. Optimizer returns:
   - selected stops (scheduled),
   - dropped stops (not scheduled) with reasons,
   - summary score and budget usage.

### 11.2 New input model
1. Add per-location fields:
   - `priority`: integer 1-5 (default 3),
   - `required`: boolean (optional; hard include when feasible),
   - `flexibleDuration`: optional min/max visit duration for future tuning.
2. Add run-level options:
   - `timeBudgetMinutes`,
   - `maxOverrunMinutes` (default 0 for strict budget),
   - `priorityWeights` (optional advanced config).

### 11.3 Objective function
1. Primary objective: maximize total selected priority score.
2. Secondary objective: maximize number of selected stops.
3. Tertiary objective: minimize total travel + wait time.
4. Hard constraints:
   - opening windows,
   - budget cap,
   - optional required stops.

### 11.4 Solver approach (practical incremental)
1. Candidate filtering:
   - remove impossible stops first (duration longer than any available window).
2. Seed selection:
   - greedy insertion by marginal value density:
   - `valueDensity = priorityGain / addedTimeCost`.
3. Feasible insertion loop:
   - attempt insertion position with minimal additional time while preserving all time windows.
4. Improvement loop:
   - perform replace moves (`drop low priority, add higher priority`) and 2-opt reorder under constraints.
5. Stop when no improving move exists or timeout threshold reached.

### 11.5 Output contract
1. `scheduledStops`: ordered itinerary with arrival/departure/wait/slack.
2. `droppedStops`: array with reason:
   - `insufficient_budget`, `closed_window`, `required_conflict`, `dominated_by_higher_priority`.
3. `summary`:
   - `totalPriority`, `completedCount`, `budgetUsedMinutes`, `budgetRemainingMinutes`, `travelMinutes`, `waitMinutes`.

### 11.6 UI updates
1. Trip Form:
   - add mode selector,
   - add time budget input,
   - add quick priority controls per location (1-5 stars).
2. Itinerary:
   - show budget bar (used vs total),
   - show dropped list with reasons,
   - show total priority score.

### 11.7 Validation checklist
1. Unit tests:
   - strict budget never exceeded,
   - higher priority stop replaces lower one when beneficial,
   - required stop handling.
2. Scenario tests:
   - dense downtown with many options,
   - sparse suburbs with long travel times,
   - mixed open/closed venues.
3. Regression:
   - existing shortest-route mode remains unchanged.

### 11.8 Rollout milestones
1. Milestone A: data model + mode flag + budget input.
2. Milestone B: seed greedy value-density selector.
3. Milestone C: feasible insertion + replace improvement.
4. Milestone D: dropped-reasons + budget summary UI.
5. Milestone E: tune weights from real user sessions.

### 11.9 Definition of done
1. In new mode, output respects budget and opening windows.
2. Priority score is measurably higher than baseline nearest-neighbor under same budget.
3. Users can understand why places were dropped.
4. Existing mode behavior remains backward compatible.
