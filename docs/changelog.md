# Changelog

## 2026-03-11
- Fixed itinerary map auto-zoom so routine clicks after a schedule exists no longer retrigger `fitBounds`; the map now recenters only when a new optimized schedule is generated, while direct focus actions still use targeted fly-to behavior.
- Tracking sync: added and completed `UX-008` in `planning/backlog.json`.
- Defaulted the OTP transit server to `http://localhost:8080/` when no env or browser override exists, and aligned the service plus Settings restore path so the effective base URL persists cleanly across reloads.
- Reworked optimized itinerary transit segments into a single clickable summary with hover feedback, removed the inline redundant leg list, and added a popup transit-detail window that shows notices, timing, transfers, walk/wait totals, and per-leg stop detail.
- Tracking sync: added and completed `TR-013` and `SH-005` in `planning/backlog.json`.
- Fixed transit map rendering to decode and use OTP leg geometry polylines instead of drawing straight stop-to-stop chords through buildings when live OTP transit is available.
- Fixed OTP transit fallback for OTP 2.9 deployments by adding GraphQL planner support and endpoint probing, while keeping legacy REST planner compatibility.
- Clarified OTP transit configuration in Settings, README, and onboarding so testing works with either `http://localhost:8080` or `http://localhost:8080/otp` depending on deployment base path.

## 2026-03-10
- Added runtime transit settings controls in Settings for mock transit and OTP base URL, persisted via browser storage and honored by the routing service at request time.
- Tracking sync: added and completed `TR-012`, and marked `TR12` done in `planning/workstreams.yaml`.
- Attached cached transit leg details to itinerary segments and rendered compact transit leg summaries plus fallback notices inside the itinerary window.
- Tracking sync: marked `TR-010` done, marked `TR10` done in `planning/workstreams.yaml`, and returned `real-transit` to `DONE`.
- Added a cached transit travel-time provider keyed by origin, destination, and departure-time bucket so optimization can reuse schedule-aware OTP results instead of refetching identical legs.
- Converted `TSPSolver` and the optimize flow to use departure-aware async travel-time lookups, so transit optimization no longer relies on the previous flat-speed heuristic.
- Documented OTP transit environment variables and a transit verification checklist in `README.md` and `docs/onboarding.md`.
- Tracking sync: marked `TR-008`, `TR-009`, and `TR-011` done, and marked `TR8`, `TR9`, and `TR11` done in `planning/workstreams.yaml`.
- Expanded the normalized transit route contract with departure/arrival timestamps, transfer count, walk/wait minutes, route labels, headsigns, stop IDs, and per-leg timing metadata while keeping existing route consumers backward-compatible.
- Tracking sync: marked `TR-007` done, and marked `TR7` done in `planning/workstreams.yaml`.
- Reopened `real-transit` to `PARTIAL` and added follow-on backlog items for visible planner transit UI, richer schedule metadata, schedule-aware optimization, itinerary leg rendering, and OTP operations/verification.
- Restored the Trip Form route estimate panel so walk, car, and transit results are visible again, including transit notices and leg summaries.
- Tracking sync: added and completed `TR-006`, and marked `TR6` done in `planning/workstreams.yaml`.
- Set Start and Set Destination actions from saved-location cards now also add the selected saved location into the trip location list when missing.
- Tracking sync: added and completed `UX-007` under `custom-nodes`.
- Saved-location cards now show each location note directly, including a muted default placeholder when no note exists.
- Replaced prompt-based rename flow with inline click-to-edit for saved-location name and note (click text to edit).
- Tracking sync: added and completed `UX-006` under `custom-nodes`.
- Reverted saved-location persistence to browser-only localStorage by product decision; removed workspace-root file read/write flow.
- Saved locations continue to persist and restore automatically on app load via localStorage.
- Tracking sync: marked `SP-001` as `superseded` and updated `session-persistence` notes/milestone wording to browser-only behavior.
- Updated folder-backed saved-location persistence to target `src/data/pois/saved-locations.json` (under a connected workspace root) and clarified this path in Settings/status messaging.
- Added folder-backed saved-location persistence using browser File System Access API with startup load and JSON sync (`saved-locations.json`) for connected folders.
- Settings now includes a "Connect or Change Folder" action and explicit fallback status messaging when folder persistence is unavailable or denied.
- Tracking sync: marked `SP-001` and `SP2` as done, set `session-persistence` to `DONE`, and removed resolved current-focus item `CF-008`.
- Moved daily availability (wake/sleep) controls from Trip Form into Settings under Time Constrained Mode.
- Trip Form timeframe feedback now points users to Settings for daily availability configuration.
- Tracking sync: marked `UX-005` and `SH4` as done, set `settings-help` workstream to `DONE`, and removed resolved current-focus item `CF-007`.
- Replaced Help panel with actionable Settings controls for Time Constrained Mode.
- Added persisted break-time setting (minutes between locations) and wired it into solver `bufferTime` so optimization output reflects the configured gap.
- Tracking sync: marked `UX-004`, `SH2`, and `SH3` as done and removed resolved current-focus item `CF-006`.
- Implemented opening-hours provenance clarity in UI: trip cards and itinerary now label hours as source-derived, user-edited, parsed text, or placeholder default.
- Manual opening-hours edits now stamp provenance as `user-edit` in trip-location metadata.
- Tracking sync: marked `OH-006` and `OH6` as done and removed resolved current-focus item `CF-005`.
- Planning-only update: added new priority items for opening-hours provenance clarity, actionable settings rework (including break-time control), moving daily availability controls into settings, and folder-backed saved-location persistence.
- Reopened related workstreams to `PARTIAL` where user-requested outcomes are not yet implemented: `opening-hours-optimizer`, `settings-help`, and `session-persistence`.
- Added current-focus overrides `CF-005` through `CF-008` so these requests take precedence in upcoming `/work` execution.
- Synced `planning/workstreams.yaml` status fields with completed backlog/milestone state: `location-model`, `opening-hours-optimizer`, `priority-budget-optimizer`, and `real-transit` are now marked `DONE`, and `OH1` milestone is marked `DONE`.
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
- Wired transit routing to pass trip schedule date/time into transit estimates and enabled transit-specific leg details in the planner route panel.
- Added graceful transit fallback/unavailable messaging: fallback estimates now include explicit user-facing notices and unavailable states are surfaced in the route panel.

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
