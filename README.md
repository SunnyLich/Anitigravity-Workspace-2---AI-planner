# TripOptimizer (Mapbox-ready)

This app plans trips and now includes a routing layer that supports:

- Mock routing (default, no API key required)
- Real Mapbox Directions API routing

## Running locally

```bash
npm install
npm run dev
```

## Environment configuration

Create a `.env` file in the project root.

### Default (mock routing)

```bash
VITE_USE_MOCK_ROUTING=true
```

### Real Mapbox routing

```bash
VITE_USE_MOCK_ROUTING=false
VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_token_here
```

When mock mode is active, route estimates are deterministic simulated outputs so UI and workflows can be built before token access.

## Current routing flow

1. Add at least two locations in the Plan Trip window.
2. Click **Estimate Route Time**.
3. The app computes route distance/time and draws route geometry on the map.
4. Provider in the UI shows `mock` or `mapbox`.

## Notes

- Existing itinerary optimization (`TSPSolver`) is still available and separate from point-to-point route estimation.
- The app no longer depends on local parsed OSM POI data for map overlays.

## Planning docs

- Planning index: `PROJECT_TRACKER_SYSTEMATIC.md`
- Product roadmap: `docs/roadmap.md`
- Workstream status (YAML): `planning/workstreams.yaml`
- Backlog tasks (JSON): `planning/backlog.json`
- Architecture overview: `docs/architecture.md`
- Onboarding guide: `docs/onboarding.md`
- Changelog: `docs/changelog.md`
- ADRs: `docs/adr/`
