# Google Maps Platform Migration Plan

Updated: 2026-03-16

## Goal

Turn this paid-version workspace from an inherited free-version provider stack into a Google Maps Platform-based app for map rendering, route estimation, and external place/geocoding flows without regressing the planner, optimizer, or itinerary UI.

## Current source-of-truth implementation

- `src/components/MapDisplay.jsx` renders the interactive map directly through Leaflet and owns route overlay drawing.
- `src/services/mapboxRouting.js` contains the normalized route-estimate contract plus Mapbox, mock, and OTP transit behavior.
- `src/services/nominatim.js` handles external search fallback and reverse geocoding.
- `src/App.jsx` imports the provider-facing services directly and also owns current OTP runtime state.
- `src/platform/desktop/otpDesktop.js` and `electron/main.cjs` expose a managed OTP runtime path that is now legacy for the paid version.

## Migration principles

1. Keep the planner and optimization contracts stable while swapping providers.
2. Do not let Google-specific response shapes leak deep into UI components.
3. Preserve local-first search and existing location normalization behavior.
4. Treat OTP desktop runtime controls as legacy code to retire, not as a destination architecture.

## Phase 1: Stabilize service boundaries

Primary files:
- `src/services/mapboxRouting.js`
- `src/App.jsx`
- `src/services/nominatim.js`

Work:
- Extract or formalize a provider-neutral route-estimate contract from `src/services/mapboxRouting.js`.
- Separate road-routing, transit-routing, and fallback behavior so Google adapters can replace them incrementally.
- Isolate reverse-geocoding and external search calls behind a clearer lookup interface before switching providers.
- Reduce direct OTP-specific state ownership in `src/App.jsx` where practical.

Exit criteria:
- `src/App.jsx` can call stable routing and lookup interfaces that do not mention Mapbox or OTP in their public contract.
- Provider-specific failures still degrade gracefully.

## Phase 2: Replace the map renderer

Primary files:
- `src/components/MapDisplay.jsx`
- `src/App.jsx`
- any new Google map wrapper module under `src/components/` or `src/services/`

Work:
- Replace the Leaflet-specific map container, marker, popup, and polyline usage in `src/components/MapDisplay.jsx` with a Google-backed implementation.
- Preserve existing props where possible: itinerary markers, route geometry, origin/destination, focus target, map-context events, and animation triggers.
- Re-check route overlay drawing and itinerary segment visibility/color behavior against the new renderer.

Exit criteria:
- The planner can render the primary map, POIs, custom nodes, endpoints, and route overlays without Leaflet.
- Existing map-driven user flows still function.

## Phase 3: Replace route estimation

Primary files:
- `src/services/mapboxRouting.js`
- `src/App.jsx`
- any new Google routing adapter under `src/services/`

Work:
- Implement Google-backed route estimation for walk, car, and transit.
- Normalize Google durations, distances, notices, and geometry into the existing route-estimate shape.
- Validate optimizer assumptions that currently depend on the normalized route payload.
- Keep mock behavior available if a non-billing development fallback is still needed.

Exit criteria:
- Walk, car, and transit route estimates come from Google-backed services in the paid flow.
- Itinerary and planner route rendering remain readable and stable.

## Phase 4: Replace external lookup and reverse geocoding

Primary files:
- `src/services/nominatim.js`
- `src/components/TripFormWindow.jsx`
- `src/App.jsx`

Work:
- Move external place lookup toward Google Places or a Google-backed geocoding flow.
- Move map-context reverse geocoding toward Google Geocoding.
- Preserve local-first search so paid API usage only happens when local data is insufficient.
- Keep normalized location fields compatible with `src/utils/locationModel.js`.

Exit criteria:
- Search and reverse-geocoding flows produce compatible location objects.
- Paid API usage is explicit and controllable.

## Phase 5: Retire legacy OTP desktop assumptions

Primary files:
- `src/platform/desktop/otpDesktop.js`
- `electron/main.cjs`
- `electron/preload.cjs`
- `src/App.jsx`

Work:
- Remove or hide OTP runtime controls from the paid app once they are no longer required.
- Delete or quarantine managed OTP install/start logic if it no longer serves a supported workflow.
- Update desktop copy, settings, and release notes so they no longer promise local OTP setup.

Exit criteria:
- Paid desktop behavior no longer depends on OTP runtime management.
- Provider configuration matches the paid Google-based architecture.

## Verification checklist

1. Planner route estimates still work for walk, car, and transit.
2. Itinerary generation still produces usable stop ordering and route overlays.
3. Saved custom locations and map-context actions still behave correctly.
4. Provider outages or quota failures still surface understandable fallback messaging.
5. README, architecture, onboarding, roadmap, workstreams, and backlog all describe the same provider direction.