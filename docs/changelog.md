# Changelog

## 2026-03-10
- Replaced priority-budget solver greedy lookahead with DFS/backtracking search plus pruning.
- Added optimistic upper-bound pruning and visited-state memoization to reduce branch exploration cost.
- Priority mode now records `searchStrategy: dfs-backtracking-pruning` in solver metadata for easier verification.
- Added strict post-search budget capping so returned priority itineraries cannot exceed budget even if a search path overflows.
- Overflow candidates are now labeled `exceeds-time-budget`, and budget metadata reflects the capped itinerary.
- Improved dropped-stop reason quality by distinguishing generic budget overflow from budget overflow caused by opening-hours waiting.
- Itinerary reason labels now include: `Exceeds budget after waiting for opening hours`.
- Trip location cards now show opening hours on a dedicated line (not muted) and include inline editable open/close time controls.
- Backlog tracking sync: marked `UX-001` as done to reflect existing travel-method active-state UI styling.
- Transit remains deferred/lower-priority (`TR-004` still todo) per current planning direction.
- Marked `ROUTE-001` as `superseded` after deciding to keep Mapbox-based routing instead of implementing OSRM fallback.
- Planning sync: updated `PB2` milestone in `planning/workstreams.yaml` to `DONE` to match shipped dropped-stop reason improvements.
- Tuned opening-hours parsing against London POI samples: now accepts `24:00` and additional range separators (`-`, en-dash, `to`) when deriving normalized `openingHours`.
- Implemented weighted fuzzy local search scoring with stronger field-aware weights and token-similarity matching to better handle minor misspellings.
- Extended normalized location schema with opening-hours provenance metadata (`openingHoursSource`, opening-rules day coverage, source metadata) while preserving backward compatibility.
- Hardened backward compatibility normalization by mapping legacy location fields (opening hours aliases, duration/priority aliases, and description note fallback) into the unified schema.
- Added in-app Settings and Help windows, wired to dock controls, replacing the previous placeholder behavior.

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
- Accepted ADR-0001 selecting OpenTripPlanner (OTP2) as the primary transit provider strategy.
- Implemented `getTransitRouteEstimate` with OTP adapter path, timeout handling, and safe mock fallback.
- Enhanced `TSPSolver` feasibility handling to enforce opening-window completion and emit unscheduled stops with `statusReason` metadata.
- Fixed priority-mode solver bias by selecting the initial stop from highest feasible priority instead of first-added order.
- Fixed priority-mode schedule timing so first-stop arrival includes travel (and wait) from the first-location start anchor when a different stop is seeded first.
- Itinerary UI now displays an explicit initial travel leg before the first stop when priority seeding starts at a different location.
- Added opening-hours status visibility in itinerary UI: unscheduled section with reasons and conflict/status badges while preserving unscheduled metadata after timeline edits.
- Updated priority-budget solver scoring with two-step lookahead so combined feasible value across multiple stops is considered, not only immediate single-stop gain.

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
