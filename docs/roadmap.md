# Product Roadmap

Updated: 2026-03-12

## Positioning

TripOptimizer has moved past the idea stage. The current application already demonstrates the core workflow end to end, and the roadmap is now focused on improving realism, reliability, and public-repo quality.

## Current baseline

The product already supports:

- map-based exploration of a London POI dataset
- local-first search with external fallback
- saved custom locations
- explicit trip start and destination selection
- route estimation for walk, car, and transit-oriented flows
- itinerary generation with multiple planning modes
- exportable itinerary views

## Now

1. Opening-hours-aware itinerary feasibility and clearer conflict handling.
2. Hardening the time-constrained optimization path.
3. Improving routing provider behavior and fallback realism.
4. Cleaning up repository quality signals: lint, tests, CI, and documentation consistency.

## Next

1. Replace the current mock-routing fallback with a more realistic backup provider.
2. Improve local search relevance with fuzzy and weighted scoring.
3. Expand POI detail quality so results are more informative to end users.
4. Improve the UI clarity of travel-mode state and planner feedback.
5. Expand custom node editing beyond rename-only workflows.

## Later

1. Add a more complete in-app settings and help surface.
2. Improve onboarding, diagnostics, and failure messaging.
3. Add richer testing around optimization behavior and routing edge cases.

## Non-goals for the current cycle

1. Replacing the core frontend stack.
2. Expanding beyond London-focused validation before the existing planning workflow is more robust.
3. Shipping major new surfaces unrelated to trip planning, routing, or itinerary quality.
