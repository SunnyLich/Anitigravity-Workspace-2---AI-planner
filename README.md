# TripOptimizer

TripOptimizer is a map-first trip planner for London, Ontario. This paid-version workspace was copied forward from a free-version baseline, so the codebase still contains inherited Leaflet, Mapbox, Nominatim, and OTP integrations while the active product direction is to migrate the map, routing, and place-lookup stack to Google Maps Platform.

The core planning workflow is already implemented. The main engineering work now is not basic scaffolding; it is replacing the inherited provider stack without regressing trip planning, itinerary output, or saved-location behavior.

## What the app does today

- Renders a full-screen interactive map with a London POI dataset.
- Supports local-first search across POIs and saved custom locations.
- Falls back to London-bounded geocoding when local search is insufficient.
- Lets users build a trip list, choose a travel mode, and set explicit start and destination points.
- Estimates route time through the inherited routing service layer, which currently uses Mapbox or deterministic mock routing for road modes and OTP or fallback behavior for transit-oriented flows.
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

What is still in progress is the paid provider migration around that loop: replacing the current provider dependencies with Google-backed map, routing, and places/geocoding services while keeping the planner behavior stable.

## Release status

- Paid-version transition workspace
- Web build and lint are expected to pass locally and in CI
- Windows desktop packaging is supported through Electron Builder
- The inherited OTP desktop path still exists in code, but it is no longer the preferred paid-version direction
- GitHub Actions can build release artifacts separately from the source repository

## Stack

- React 19
- Vite 7
- Leaflet + React Leaflet in the current implementation
- Lucide React
- html2canvas + jsPDF
- Mapbox Directions API and OpenTripPlanner in the inherited implementation
- Google Maps Platform as the target paid integration

## Provider transition status

Current implementation:

- `src/components/MapDisplay.jsx` renders the map through Leaflet.
- `src/services/mapboxRouting.js` owns the normalized route-estimate contract and currently contains both Mapbox/mock road logic and OTP/mock transit logic.
- `src/services/nominatim.js` provides external search and reverse geocoding fallback.
- `electron/main.cjs` plus `src/platform/desktop/otpDesktop.js` still expose the inherited managed OTP desktop runtime.

Target paid implementation:

- Replace the map surface with Google Maps.
- Replace Mapbox and OTP route calls with Google-backed route estimation.
- Move external search and reverse geocoding toward Google Places and Geocoding while preserving local-first search.
- Remove or hide OTP-specific desktop/runtime assumptions from the paid app once Google-backed behavior is in place.

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

Create a local environment file in the project root. You can start from `.env.example`.

The checked-in template reflects the inherited provider stack, which is still what the code currently runs. Google API configuration is part of the active migration work and is not fully wired yet.

### Mock routing only

```bash
VITE_USE_MOCK_ROUTING=true
VITE_USE_MOCK_TRANSIT=true
```

### Current inherited live routing

```bash
VITE_USE_MOCK_ROUTING=false
VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_token_here
```

### Current inherited schedule-aware transit via OTP

```bash
VITE_USE_MOCK_TRANSIT=false
VITE_OTP_BASE_URL=http://localhost:8080
VITE_OTP_TIMEOUT_MS=12000
```

`VITE_OTP_BASE_URL` may point either at the server root or an `/otp` deployment base, depending on how OpenTripPlanner is hosted.

### Current inherited desktop managed OTP overrides

These environment variables are read by the Electron main process for the packaged/desktop runtime, not by the browser bundle.

```bash
TRIPOPTIMIZER_MANAGED_OTP_VERSION=2.8.1
TRIPOPTIMIZER_MANAGED_OTP_SERIALIZATION_ID=203
TRIPOPTIMIZER_MANAGED_OTP_JAR_URL=https://example.invalid/otp-shaded-custom.jar
TRIPOPTIMIZER_MANAGED_OTP_JAR_PATH=C:\path\to\otp-shaded-custom.jar
```

Use these only if you are still exercising the inherited OTP runtime during the migration window.

### Paid-version target configuration

The paid roadmap is moving toward Google API configuration for map rendering, route estimation, places/autocomplete, and geocoding. The exact environment surface for that integration should be finalized alongside the implementation work in `docs/google-migration-plan.md`.

## Platform layout

- Web entry point: `src/platform/web/main.jsx`
- Desktop bridge helpers: `src/platform/desktop/otpDesktop.js`
- Electron shell: `electron/`
- Shared planner UI and logic: `src/`

The current repo still uses one shared React planner for both targets. The paid migration is expected to preserve that shared-planner model while swapping provider-facing modules underneath it.

## Repository status

This repository is currently positioned as a public preview and engineering showcase. The codebase is useful for demonstrating:

- a map-centric planner UI
- local-first search and location modeling
- travel-mode-aware routing hooks
- heuristic trip optimization
- pragmatic integration boundaries between frontend state, mapping, and routing providers

## Known limitations

- Mock routing remains a UI-development fallback rather than a road-accurate backup provider.
- The current provider stack still depends on inherited Mapbox, Nominatim, and OTP behavior that is being phased out for the paid version.
- The optimization flow is useful today, but schedule-feasibility behavior needs further hardening.
- Search relevance is functional but still fairly simple.
- The production bundle should be split more aggressively.
- CI now validates lint and production web builds automatically, but deeper automated runtime and packaging coverage is still limited.

## Roadmap focus

Near-term work is concentrated on:

1. Replacing the inherited map, routing, and place-lookup provider stack with Google Maps Platform.
2. Keeping planner, itinerary, and optimization behavior regression-safe during the provider swap.
3. Tightening paid-version documentation, configuration, and release expectations around the new provider model.

## Project references

- Working tracker: `PROJECT_TRACKER.md`
- Product roadmap: `docs/roadmap.md`
- Architecture overview: `docs/architecture.md`
- Google migration plan: `docs/google-migration-plan.md`
- Onboarding guide: `docs/onboarding.md`
- User guide: `docs/user-guide.md`
- Changelog: `docs/changelog.md`
- ADRs: `docs/adr/`
