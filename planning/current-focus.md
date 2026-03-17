# Current Focus

Last updated: 2026-03-16

Purpose:
This file contains temporary priorities defined by the user that override the normal roadmap and backlog.

## Highest priority problems

### CF-001 Paid provider migration baseline
Problem
This paid-version workspace still runs on the inherited Leaflet, Mapbox, Nominatim, and OTP provider stack from the free version.
Expected
Planning and documentation should now prioritize Google Maps Platform migration for map rendering, route estimation, places/autocomplete, and geocoding.
Possible area
`src/components/MapDisplay.jsx`, `src/services/mapboxRouting.js`, `src/services/nominatim.js`, `src/App.jsx`, `src/platform/desktop/otpDesktop.js`, `electron/main.cjs`, `docs/google-migration-plan.md`

### CF-002 Keep planner behavior stable during provider swap
Problem
The provider migration must not break itinerary generation, route overlays, saved locations, or map context actions.
Expected
The normalized route and location contracts remain stable while provider-specific code changes underneath them.
Possible area
`src/App.jsx`, `src/utils/locationModel.js`, `src/utils/tspSolver.js`, `src/components/TripFormWindow.jsx`, `src/components/ItineraryWindow.jsx`

<!-- 
Problem Template
### CF-001 Date and icon overlap in itinerary UI
Problem
Date text overlaps the icon in itinerary header.
Expected
Icon and text never overlap.
Possible area
src/components/ItineraryWindow.jsx
 -->