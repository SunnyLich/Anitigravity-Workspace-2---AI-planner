# Engineering Onboarding

## Quick start
1. Install dependencies:

```bash
npm install
```

2. Run dev server:

```bash
npm run dev
```

Platform-specific entry points are now labeled explicitly:

- Web entry: `src/platform/web/main.jsx`
- Desktop bridge: `src/platform/desktop/otpDesktop.js`
- Shared UI and planner logic remain in `src/`

3. Validate baseline manually:
- Map and planner window render.
- POI overlay appears.
- Add 2+ places and run:
  - `Estimate Route Time`
  - `Optimize Schedule`
- Test both optimization modes in planner.

This baseline is still the inherited free-version provider implementation. Paid-version engineering work is currently focused on replacing that provider layer with Google Maps Platform, not on expanding the old OTP and Mapbox setup.

## Current inherited routing environment
- Mock mode (default):
  - `VITE_USE_MOCK_ROUTING=true`
- Real Mapbox mode:
  - `VITE_USE_MOCK_ROUTING=false`
  - `VITE_MAPBOX_ACCESS_TOKEN=...`
- Mock transit mode (default-safe during UI development):
  - `VITE_USE_MOCK_TRANSIT=true`
- Real transit mode (OTP):
  - `VITE_USE_MOCK_TRANSIT=false`
  - `VITE_OTP_BASE_URL=http://localhost:8080`
  - `VITE_OTP_TIMEOUT_MS=12000`
  - Use the OTP deployment base URL (`http://localhost:8080` for root-mounted OTP or `http://localhost:8080/otp` when served under `/otp`).
  - OTP 2.9+ deployments may expose GraphQL trip planning instead of the legacy REST planner path; the app probes the supported GraphQL planner endpoints automatically before falling back to the legacy REST endpoint.
- Desktop managed OTP defaults to OTP 2.8.1 and now validates the bundled `graph.obj` serialization id before launch.
- If the bundled graph was built with a different OTP build, set `TRIPOPTIMIZER_MANAGED_OTP_JAR_PATH` or `TRIPOPTIMIZER_MANAGED_OTP_JAR_URL` together with `TRIPOPTIMIZER_MANAGED_OTP_SERIALIZATION_ID` for the Electron process.

## Paid-version migration target

- Primary map surface should move from Leaflet to Google Maps.
- Provider-backed route estimation should move from Mapbox and OTP to Google-backed services.
- External place search and reverse geocoding should move from Nominatim fallback toward Google Places and Geocoding, while preserving local-first search.
- OTP runtime setup should be treated as legacy support during migration, not as the future desktop model.

## First implementation pass

- Start with `src/services/mapboxRouting.js` and extract the normalized route contract from provider-specific code.
- Inspect `src/components/MapDisplay.jsx` and decide whether to wrap or replace the Leaflet-specific renderer.
- Keep `src/App.jsx` stable as the orchestration layer while swapping provider-facing modules underneath it.
- Treat `src/services/nominatim.js`, `src/platform/desktop/otpDesktop.js`, and `electron/main.cjs` as explicit migration targets rather than permanent architecture.
- Use `docs/google-migration-plan.md` as the working technical plan before writing provider code.

## Verification focus during migration

- Route estimates still render geometry and durations for walk, car, and transit selections.
- Optimizer output remains stable when provider responses change.
- Map context actions still create usable locations with good address data.
- Provider failure states remain understandable and non-breaking.
- Paid documentation stays honest about what is already migrated versus still inherited.

## Planning docs map
- Product priorities: `docs/roadmap.md`
- Workstream status: `planning/workstreams.yaml`
- Task backlog: `planning/backlog.json`
- Technical migration plan: `docs/google-migration-plan.md`
- Architecture context: `docs/architecture.md`
- Change history: `docs/changelog.md`
