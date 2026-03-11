# TripOptimizer (Mapbox + OTP transit)

This app plans trips and now includes a routing layer that supports:

- Mock routing (default, no API key required)
- Real Mapbox Directions API routing
- OTP-backed transit estimates with mock fallback

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

### Transit routing

```bash
VITE_USE_MOCK_TRANSIT=true
```

For schedule-aware transit:

```bash
VITE_USE_MOCK_TRANSIT=false
VITE_OTP_BASE_URL=http://localhost:8080
VITE_OTP_TIMEOUT_MS=12000
```

`VITE_OTP_BASE_URL` should point at the OTP deployment base URL. Both `http://localhost:8080` and `http://localhost:8080/otp` are valid depending on how OTP is hosted.
For OTP 2.9 and newer builds that expose GraphQL planning instead of the legacy REST planner path, the app automatically probes the supported GraphQL planner endpoints first and falls back to the legacy REST endpoint when available.

When mock mode is active, route estimates are deterministic simulated outputs so UI and workflows can be built before token access.
When transit mock mode is disabled, the app queries OTP and falls back to a labeled mock transit estimate if OTP is unavailable, times out, or returns no itinerary.

## Current routing flow

1. Add at least two locations in the Plan Trip window.
2. Click **Estimate Route Time**.
3. The app computes route distance/time and draws route geometry on the map.
4. Provider in the UI shows `mock` or `mapbox`.

## Notes

- Existing itinerary optimization (`TSPSolver`) is still available and separate from point-to-point route estimation.
- Transit optimization now requests schedule-aware transit travel times during solver exploration and caches results by origin, destination, and departure-time bucket.
- The app no longer depends on local parsed OSM POI data for map overlays.

## Transit verification

1. Mock transit path:
	- Set `VITE_USE_MOCK_TRANSIT=true`.
	- Choose `transit` in the planner and run optimization.
	- Confirm the Trip Form route card shows `mock-transit` plus a fallback notice and transit legs.
2. OTP success path:
	- Set `VITE_USE_MOCK_TRANSIT=false` and configure `VITE_OTP_BASE_URL`.
	- If OTP is mounted at the server root, use `http://localhost:8080`. If OTP is served under `/otp`, use `http://localhost:8080/otp`.
	- Run a transit estimate/optimization during a time when OTP has service data.
	- Confirm the route card shows `otp`, `Live transit`, and stop-to-stop leg details.
3. OTP timeout/unavailable path:
	- Stop OTP or point `VITE_OTP_BASE_URL` to an unavailable instance.
	- Confirm the app still returns a usable transit estimate with an unavailable notice.
4. No-itinerary path:
	- Query an origin/destination/time combination with no service.
	- Confirm the fallback notice explains that no transit itinerary was returned.

## Planning docs

- Planning index: `PROJECT_TRACKER_SYSTEMATIC.md`
- Product roadmap: `docs/roadmap.md`
- Workstream status (YAML): `planning/workstreams.yaml`
- Backlog tasks (JSON): `planning/backlog.json`
- Architecture overview: `docs/architecture.md`
- Onboarding guide: `docs/onboarding.md`
- Changelog: `docs/changelog.md`
- ADRs: `docs/adr/`
