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

## Routing environment
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

## Transit verification
- Success path:
  - Start OTP with GTFS + OSM data loaded.
  - Select `transit` and run both route estimate and optimize flows.
  - Confirm provider `otp` is visible and transit leg details render.
- Timeout/unavailable path:
  - Stop OTP or point `VITE_OTP_BASE_URL` to a dead endpoint.
  - Confirm planner still shows a fallback estimate and an unavailable notice.
- No-itinerary path:
  - Test a time/location pair with no scheduled service.
  - Confirm planner shows the no-itinerary fallback notice.
- Regression check:
  - Re-run walk and car route/optimization flows and confirm visible route estimates still render.

## Planning docs map
- Product priorities: `docs/roadmap.md`
- Workstream status: `planning/workstreams.yaml`
- Task backlog: `planning/backlog.json`
- Architecture context: `docs/architecture.md`
- Change history: `docs/changelog.md`
