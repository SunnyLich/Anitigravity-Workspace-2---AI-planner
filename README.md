# TripOptimizer

TripOptimizer is a map-first trip planning prototype for London, Ontario. It combines local POI search, saved custom locations, route estimation, and itinerary optimization in a single React + Leaflet interface.

The repository is best understood as a polished planning prototype: the core workflow is implemented, the app builds for production, and the remaining work is focused on routing fidelity, solver hardening, and repo-level quality rather than basic feature scaffolding.

## What the app does today

- Renders a full-screen interactive map with a London POI dataset.
- Supports local-first search across POIs and saved custom locations.
- Falls back to London-bounded geocoding when local search is insufficient.
- Lets users build a trip list, choose a travel mode, and set explicit start and destination points.
- Estimates route time using real Mapbox routing or deterministic mock routing.
- Supports transit estimates through OTP with labeled fallback behavior when transit data is unavailable.
- Generates optimized itineraries with time-budget and priority-aware planning modes.
- Persists trip state and custom nodes in local storage.
- Exports itinerary views to image or PDF.

## Current product shape

The core product loop is already in place:

1. Search or create locations.
2. Add them to a trip.
3. Choose travel mode and trip constraints.
4. Estimate routes or optimize a visit order.
5. Review the resulting itinerary on the map and in the itinerary panel.

What is still in progress is the realism layer around that loop: higher-quality fallback routing, stronger schedule-feasibility logic, richer POI details, and better public-repo quality signals such as tests and CI.

## Stack

- React 19
- Vite 7
- Leaflet + React Leaflet
- Lucide React
- html2canvas + jsPDF
- Mapbox Directions API for optional live routing
- OpenTripPlanner for optional transit estimation

## Desktop OTP build

The repository now includes a desktop packaging path that can manage a local OTP runtime for the user.

- The Windows desktop build bundles the transit graph assets from `src/data/Transit`.
- The managed desktop runtime defaults to OTP 2.8.1; the bundled `graph.obj` must be built with a compatible OTP serialization id or startup will be rejected before launch.
- Inside the app's Settings window, the app detects whether OTP is reachable on the configured local URL.
- The `Install + Run OTP` button downloads a portable Java 21 runtime and the OTP shaded JAR on first use, then launches OTP against the bundled graph.
- If the graph was built with a different OTP build, you can override the managed artifact with `TRIPOPTIMIZER_MANAGED_OTP_JAR_PATH` or `TRIPOPTIMIZER_MANAGED_OTP_JAR_URL` plus `TRIPOPTIMIZER_MANAGED_OTP_SERIALIZATION_ID`.
- After OTP is running, the app can switch off mock transit and route against the local server without any manual OTP setup.

### Desktop development

```bash
npm run dev:desktop
```

### Build Windows desktop packages

```bash
npm run build:desktop
```

Artifacts are written to the `release/` folder.



## Environment configuration

Create a local environment file in the project root.

### Mock routing only

```bash
VITE_USE_MOCK_ROUTING=true
VITE_USE_MOCK_TRANSIT=true
```

### Live Mapbox routing

```bash
VITE_USE_MOCK_ROUTING=false
VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_token_here
```

### Schedule-aware transit via OTP

```bash
VITE_USE_MOCK_TRANSIT=false
VITE_OTP_BASE_URL=http://localhost:8080
VITE_OTP_TIMEOUT_MS=12000
```

`VITE_OTP_BASE_URL` may point either at the server root or an `/otp` deployment base, depending on how OpenTripPlanner is hosted.

### Desktop managed OTP overrides

These environment variables are read by the Electron main process for the packaged/desktop runtime, not by the browser bundle.

```bash
TRIPOPTIMIZER_MANAGED_OTP_VERSION=2.8.1
TRIPOPTIMIZER_MANAGED_OTP_SERIALIZATION_ID=203
TRIPOPTIMIZER_MANAGED_OTP_JAR_URL=https://example.invalid/otp-shaded-custom.jar
TRIPOPTIMIZER_MANAGED_OTP_JAR_PATH=C:\path\to\otp-shaded-custom.jar
```

Use these only when the bundled `graph.obj` was built with an OTP version that does not match the default managed runtime.

## Repository status

This repository is currently positioned as a working prototype and engineering showcase, not as a finished end-user product. The codebase is useful for demonstrating:

- a map-centric planner UI
- local-first search and location modeling
- travel-mode-aware routing hooks
- heuristic trip optimization
- pragmatic integration boundaries between frontend state, mapping, and routing providers

## Known limitations

- Mock routing remains a UI-development fallback rather than a road-accurate backup provider.
- Transit support depends on OTP availability and still needs broader real-world validation.
- The optimization flow is useful today, but schedule-feasibility behavior needs further hardening.
- Search relevance is functional but still fairly simple.
- The production bundle should be split more aggressively.
- Repository quality signals such as automated tests and CI are not yet in place.

## Roadmap focus

Near-term work is concentrated on:

1. Hardening itinerary feasibility around time windows and user constraints.
2. Improving routing realism and fallback quality.
3. Tightening the public-repo experience with cleaner documentation, tests, and automation.

## Project references

- Planning index: `PROJECT_TRACKER_SYSTEMATIC.md`
- Working tracker: `PROJECT_TRACKER.md`
- Product roadmap: `docs/roadmap.md`
- Architecture overview: `docs/architecture.md`
- Onboarding guide: `docs/onboarding.md`
- Changelog: `docs/changelog.md`
- ADRs: `docs/adr/`
