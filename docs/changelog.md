# Changelog

## 2026-03-09
- Split project tracker into focused planning artifacts under `docs/` and `planning/`.
- Added `openingRules` compatibility adapter in location normalization.
- Legacy `openingHours` weekly maps now normalize into `openingRules.days`.
- Derived fallback `openingHours` from normalized rules to avoid regressions in persisted data.
- Map POI right-click context menu now carries POI address through to added trip locations.
- Empty-map context actions now reverse geocode coordinates via Nominatim for full-address enrichment.
- Added in-memory caching and request throttling for reverse geocoding to stay usage-safe.
- Saved-location rename/edit now syncs to linked trip entries via `linkedCustomNodeId`.
- Defined a normalized route/transit response contract in `mapboxRouting` for adapter-ready provider integration.

## 2026-03-05
- Added opening-hours-aware optimization implementation plan.
- Added budgeted priority optimization mode plan and mode wiring.
- Added per-location priority controls and first-pass `max-priority-budget` solver path.

## 2026-02-26
- Location list now shows address text.
- Clicking location row pans/zooms map to location.
- Preserved POI address in normalized location data.
- Simplified route-status UI in planner panel.
- Improved optimized itinerary route geometry behavior.

## 2026-02-25
- Integrated Mapbox routing service with mock/real modes.
- Restored POI overlay from local dataset.
- Added map context menu for Start, Destination, and custom-node creation.
- Added explicit start/destination selectors.
- Added local-first search with London-bounded fallback.
- Added custom node persistence and management.
- Added session persistence for core trip state.
