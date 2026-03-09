# TripOptimizer Project Tracker (Reader Mode)

Last updated: 2026-03-09  
Owner: Team

This is the human-readable master tracker for day-to-day use.

---

## How to read this file quickly

### 2-minute view
1. Read **Section 1 (At a glance)**.
2. Check **Section 4 (Execution order)** for what should happen next.
3. Use **Sections 6-8** only when implementing those workstreams.

### Source-of-truth split files
- Product priorities: `docs/roadmap.md`
- Workstream status (machine-readable): `planning/workstreams.yaml`
- Backlog tasks (machine-readable): `planning/backlog.json`
- Architecture context: `docs/architecture.md`
- Onboarding checklist: `docs/onboarding.md`
- Change history: `docs/changelog.md`

---

## 1) At a glance

### What works now
1. App opens with a full-screen Leaflet map of London, Ontario.
2. App loads `public/london-pois.json` and renders POI dots.
3. Search is local-first (POIs + custom nodes), then London-bounded Nominatim fallback.
4. Search results can be added into a `Locations` list.
5. User actions:
   - **Optimize Schedule** (local heuristic TSP solver)
   - **Estimate Route Time** (Mapbox Directions API or mock fallback)
6. App draws itinerary polyline or route geometry on map.
7. Itinerary panel supports JPG/PDF export.
8. Right-click map supports:
   - set Location
   - create custom location at clicked coordinates
9. Custom nodes are saved in `localStorage` and restored on refresh.
10. User can choose Start/Destination explicitly; route estimation uses selected endpoints.
11. Saved custom nodes can be shown, renamed, deleted, and added to trip list.
12. Session state persists (trip list, travel method, selected endpoints, custom nodes).
13. Route estimation includes all trip locations (not only endpoints), attempts multi-stop optimization, then falls back.
14. Plan Trip supports two optimization modes in one window:
   - `Shortest Feasible`
   - `Most Wanted In Time`
15. `Most Wanted In Time` allows trip time budget + per-location priority (1-5).
16. POI hours text is preserved in normalized location data (`openingHours` + `openingHoursText`) when adding POIs from map context menu.

### Known gaps (prioritized)

| Priority | Gap |
|---|---|
| High | Transit mode is placeholder (not schedule-aware real transit routing) |
| High | Mock routing is not road-accurate; replace with OSRM fallback |
| Medium | Search ranking is basic substring matching (no fuzzy/weighted scoring) |
| Medium | POI info shown to users is not yet sufficiently meaningful |
| Medium | Travel method active state should be more identifiable |
| Medium | Custom node editor supports rename only (no note/category editing UI) |
| Low | No dedicated settings/help panels yet |

---

## 2) Architecture + data flow (quick reference)

### Frontend stack
- React + Vite
- Leaflet (`react-leaflet`) for map rendering
- Lucide icons
- `html2canvas` + `jspdf` for itinerary export

### Important files
- `src/main.jsx` → app entry point
- `src/App.jsx` → top-level state + wiring between map and windows
- `src/components/TripFormWindow.jsx` → search, location list, optimize/estimate actions
- `src/components/MapDisplay.jsx` → map tiles, POI dots, markers, route line
- `src/components/ItineraryWindow.jsx` → itinerary timeline + export actions
- `src/services/nominatim.js` → external place search
- `src/services/mapboxRouting.js` → route time/path (Mapbox + mock)
- `src/utils/tspSolver.js` → local optimizer
- `public/london-pois.json` → local POI dataset

### Data flow
1. **POI overlay:** `App` loads POIs → passes to `MapDisplay` → markers render.
2. **Search:** local ranked search first (`pois + customNodes`) → bounded Nominatim fallback if needed → merged results shown.
3. **Route estimate:** `Estimate Route Time` → `App.handleEstimateRoute(...)` → `mapboxRouting.getRouteEstimate(...)` → geometry drawn in map.
4. **Itinerary optimization:** `Optimize Schedule` → `TSPSolver.solve()` → itinerary shown + polyline drawn.

---

## 3) Environment setup

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

## 4) Suggested implementation order (next)

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
- Surface `wait`, `closed`, and `unscheduled` statuses in itinerary UI with edit actions.

### Phase 6: Priority-with-time-budget mode
- Add a second optimization objective: maximize total priority score under total-time cap.
- Add required inputs: total time budget, optional hard-required stops, and stop priorities.
- Produce selected + dropped stop sets with reasons and score summary.
- Expose optimizer mode toggle in Trip planner UI.

---

## 5) Progress status

Legend:
- `DONE` = implemented and usable
- `PARTIAL` = some foundation exists but not full workflow
- `TODO` = not implemented

| Item | Status | Notes |
|---|---|---|
| Define location data model | PARTIAL | `src/utils/locationModel.js` centralizes normalization/custom-node creation/deduping |
| Add map context menu actions | DONE | Implemented |
| Support click-to-create custom nodes | DONE | Implemented |
| Persist custom nodes locally | DONE | `localStorage` implemented |
| Build local POI search index | DONE | `src/utils/localSearch.js` ranking/index exists |
| Prioritize London-only search results | DONE | External fallback bounded and prioritized |
| Add start/destination selectors | DONE | Implemented |
| Route from selected endpoints | DONE | Implemented |
| Show/edit/delete saved nodes | DONE | Implemented |
| Document UX and settings | PARTIAL | Tracker/docs improved; in-app help/settings still missing |
| Opening-hours-aware optimization | PARTIAL | Baseline parsing + POI hour preservation done; full rule model + conflict UI pending |
| Budgeted priority optimization mode | PARTIAL | Mode toggle + budget + priorities + initial greedy solver path implemented |

---

## 6) Implementation Plan: Opening-Hours-Aware Optimization

**Goal:** make `Optimize Schedule` produce feasible itineraries that respect opening windows, not only distance/travel heuristics.

### 6.1 Functional requirements (MVP)
1. Each stop has visit duration and one or more opening windows for selected trip date.
2. Solver can wait for opening time, but cannot finish after closing.
3. If no feasible insertion exists, stop is marked `unscheduled` with reason.
4. UI shows per-stop status: `on-time`, `wait`, `unscheduled`.
5. User can manually adjust arrival/departure and immediately see feasibility.

### 6.2 Data model changes
1. Replace simple `openingHours: { start, end }` with:
   - `openingRules`: weekday keyed windows (example `mon: [{ start: '09:00', end: '17:00' }]`)
   - `specialClosures`: optional closed dates array
   - `timezone`: optional IANA timezone (default local)
2. Keep backward compatibility adapter:
   - existing `openingHours` maps to a daily single-window rule during migration
3. Add normalized schedule fields to itinerary output:
   - `status`, `statusReason`, `windowUsed`, `slackMinutes`

### 6.3 Solver strategy (incremental)
1. **Step A (MVP greedy):**
   - nearest-neighbor selection + earliest feasible start within candidate windows
   - cost = travel + wait + near-close risk penalty
2. **Step B (improvement):**
   - local search pass (swap / 2-opt-like) only if schedule remains feasible
3. **Step C (future):**
   - optional objective to maximize completed stops when all cannot fit

### 6.4 Edge-case handling rules
1. Cross-midnight windows (example `18:00-02:00`) must be supported.
2. Multiple windows per day (example lunch closure) must be supported.
3. Closed day or special closure must immediately mark stop unschedulable.
4. If trip date is missing, fallback to `today` with warning badge.
5. Keep times as absolute minutes from trip start day for multi-day continuity.

### 6.5 UI and UX updates
1. Trip planner input:
   - simple opening-hours editor (MVP: one window + closed toggle)
   - `Use POI default hours` action when source data contains hours
2. Itinerary panel:
   - badges: `Wait Xm`, `Closed`, `Unscheduled`
   - unscheduled section with reasons + `retry with priorities` action
3. Optimize action:
   - non-blocking warning summary: `N stops unscheduled`

### 6.6 Validation and testing checklist
1. Unit tests for time normalization:
   - window parsing, cross-midnight conversion, next-feasible-slot
2. Solver tests:
   - all stops feasible
   - some stops infeasible
   - multi-window day
   - long duration exceeding any window
3. UI tests/manual scripts:
   - badges render correctly
   - unscheduled list appears
   - manual time edit updates feasibility

### 6.7 Rollout plan
1. Milestone 1: data model adapter + helper functions (no UI change)
2. Milestone 2: solver feasibility + unscheduled output
3. Milestone 3: itinerary badges + unscheduled section
4. Milestone 4: trip-form opening-hours editor
5. Milestone 5: tuning + benchmark on real London POI samples

### 6.8 Definition of done
1. Optimizer never schedules a stop outside opening windows.
2. Unschedulable stops are explicit and actionable in UI.
3. Existing saved locations still load via backward-compatible mapping.
4. Build passes and key solver tests pass in CI/local.

---

## 7) Implementation Plan: Max-Priority Within Time Budget

**Goal:** add optimizer mode that selects and orders stops to maximize user value within a fixed trip-time budget.

### 7.1 Product behavior
1. User chooses optimization mode:
   - `Shortest Feasible Route` (existing)
   - `Time-Constrained Fit` (new)
2. In `TripFormWindow`, mode selector appears above `Trip Date` and mirrors travel-method selector style.
3. In `Time-Constrained Fit`, user sets full trip window using start/end **date + time**.
4. User sets daily availability hours (`wakeTime`, `sleepTime`).
5. User sets per-location visit minutes and priority as required fields.
6. Optimizer returns:
   - selected stops (scheduled)
   - dropped stops with reasons
   - summary score/timeframe usage

### 7.2 New input model
1. Per-location fields:
   - `userPriority` (1-5, required; default 3 until edited)
   - `required` (optional hard include when feasible)
   - `visitDurationMinutes` (required)
   - `flexibleDuration` (optional min/max, future tuning)
2. Run-level options:
   - `tripStartTime`
   - `tripEndTime`
   - derived `timeBudgetMinutes = tripEndTime - tripStartTime`
   - `maxOverrunMinutes` (default 0)
   - `priorityWeights` (optional advanced config)

### 7.3 Objective function
1. Primary: maximize total selected priority score.
2. Secondary: maximize number of selected stops.
3. Tertiary: minimize total travel + wait time.
4. Hard constraints:
   - opening windows
   - budget cap
   - optional required stops

### 7.4 Solver approach (incremental)
1. Candidate filtering: remove impossible stops first.
2. Seed selection: greedy insertion by marginal value density.
   - `valueDensity = priorityGain / addedTimeCost`
3. Feasible insertion loop: choose insertion with minimal added time while preserving all windows.
4. Improvement loop: replace moves + 2-opt reorder under constraints.
5. Stop when no improving move exists or timeout threshold is reached.

### 7.5 Output contract
1. `scheduledStops`: ordered itinerary with arrival/departure/wait/slack.
2. `droppedStops`: reasoned list:
   - `insufficient_budget`, `closed_window`, `required_conflict`, `dominated_by_higher_priority`
3. `summary`:
   - `totalPriority`, `completedCount`, `budgetUsedMinutes`, `budgetRemainingMinutes`, `travelMinutes`, `waitMinutes`

### 7.6 UI updates
1. Trip Form:
   - mode selector above `Trip Date`
   - visual style parallel to travel method selector
   - `Trip Start Time` + `Trip End Time` in `Time-Constrained Fit`
   - required per-location `Visit Duration (min)`
   - required per-location `User Priority` controls (1-5)
2. Itinerary:
   - budget bar (used vs total)
   - dropped list with reasons
   - total priority score

### 7.7 Validation checklist
1. Unit tests:
   - strict budget never exceeded
   - higher priority replaces lower when beneficial
   - required-stop handling
2. Scenario tests:
   - dense downtown / many options
   - sparse suburbs / long travel
   - mixed open/closed venues
3. Regression:
   - existing shortest-route mode unchanged

### 7.8 Rollout milestones
1. Milestone A: data model + mode flag + budget input
2. Milestone B: seed greedy value-density selector
3. Milestone C: feasible insertion + replace improvement
4. Milestone D: dropped-reasons + budget summary UI
5. Milestone E: tune weights from real user sessions

### 7.9 Definition of done
1. New mode output respects budget and opening windows.
2. Priority score is measurably higher than nearest-neighbor baseline under same budget.
3. Users can understand why places were dropped.
4. Existing mode behavior remains backward compatible.

---

## 8) Implementation Plan: Real Transit Routing

**Goal:** replace placeholder `transit` behavior with real public-transit-aware routing and ETA estimation for London, Ontario.

### 8.1 Current state
1. UI exposes `walk`, `car`, `transit`.
2. Transit currently maps to driving-like behavior:
   - Mapbox profile alias uses `driving-traffic` for `transit`
   - mock mode uses fixed transit speed assumptions
3. Current transit estimates are not based on real stops/schedules/transfers/calendars.

### 8.2 Evaluation candidates
1. OpenTripPlanner (OTP) with GTFS + OSM (self-hosted)
2. Google Directions/Routes Transit API (managed)
3. TransitLand / GTFS-powered providers
4. City/regional open transit API or GTFS-RT feed for London

### 8.3 Decision criteria
1. Coverage quality for London, Ontario
2. Itinerary detail depth (legs, transfers, walking connectors, times)
3. Cost/rate limits and long-term operational risk
4. Latency/reliability for interactive planner UX
5. Licensing/terms compatibility

### 8.4 Milestones
1. T1: compare providers and choose primary + fallback
2. T2: add transit adapter (`getTransitRouteEstimate`) + response normalization
3. T3: wire transit flow without changing walk/car behavior
4. T4: show transit itinerary details (line labels, transfer count, departure/arrival)
5. T5: add graceful fallback + `transit unavailable` states

### 8.5 Definition of done
1. Selecting `transit` uses real provider data in non-mock mode.
2. Returned route includes schedule-aware ETA and multi-leg path.
3. Unsupported areas/times fail gracefully with clear messaging.
4. Existing `walk` and `car` behavior remains regression-safe.

---

## 9) Onboarding checklist (new engineers)
- Read this file once end-to-end.
- Run app locally and verify map + plan window appears.
- Confirm POI count badge is around **3031**.
- Add 2 places via search and test:
  - `Estimate Route Time`
  - `Optimize Schedule`
- Open `App.jsx`, `TripFormWindow.jsx`, `MapDisplay.jsx` together to understand state flow.

---

## 10) Change log (detailed)

### 2026-03-05
- Added dedicated opening-hours-aware optimization plan (data model, solver strategy, UI behavior, test/rollout checklist).
- Added dedicated budgeted-priority optimization plan for “visit the most wanted places within a fixed time limit”.
- Implemented mode switch in existing Plan Trip window (no separate window), with mode-specific fields.
- Added per-trip-location user priority controls (default priority = 1).
- Added first-pass `max-priority-budget` solver path in `TSPSolver` and wired optimize calls with mode + budget.

### 2026-02-26
- Locations list now shows address text (when available) under place name.
- Clicking location row in Plan Trip pans/zooms map to that location.
- POI address is preserved in normalized location data for better display/search context.
- Removed routing status text/elapsed display from Plan Trip panel and loading overlay (UX simplification).
- Removed in-panel route estimate summary card while keeping route rendering on the map.
- Routed live status updates into Plan Trip panel during route estimation.
- Added in-panel elapsed-time display for routing progress visibility.
- Updated Optimize Schedule to request route geometry for optimized itinerary so map shows routed path, not just dotted straight-line fallback.
- Removed decorative header status marker that could appear as stray “-” under certain UI scaling.

### 2026-02-25
- Integrated Mapbox routing service with mock/real modes.
- Restored POI overlay (3031 dots from `london-pois.json`).
- Tracker created for plan + progress + onboarding.
- Added right-click map context menu for Start, Destination, and custom-node creation.
- Added explicit Start/Destination selectors in Plan Trip panel.
- Added `localStorage` persistence for custom nodes.
- Added local-first search with London-bounded external fallback.
- Added saved custom node list with rename/delete/use actions.
- Added persisted trip session state (trip list, travel method, selected endpoints).
- Added dedicated local search index utility with relevance scoring.
