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

## Current UX features

- Right-click map to:
	- set Start point,
	- set Destination,
	- create custom location at clicked coordinates.
- Search is local-first:
	- local POIs and saved custom nodes are ranked first,
	- then London-bounded Nominatim fallback is used.
- Start/Destination can be selected explicitly from dropdown selectors.
- Saved custom nodes can be renamed, deleted, or added into the trip list.

## Session persistence

The app persists the following in browser `localStorage`:

- custom nodes,
- trip location list,
- selected travel method,
- selected start/destination IDs.

This means reloading localhost should keep your working session by default.

## Notes

- Existing itinerary optimization (`TSPSolver`) is still available and separate from point-to-point route estimation.
- The map currently renders local POI overlay data from `public/london-pois.json`.
- See `PROJECT_TRACKER.md` for current architecture, missing features, and implementation plan status.
