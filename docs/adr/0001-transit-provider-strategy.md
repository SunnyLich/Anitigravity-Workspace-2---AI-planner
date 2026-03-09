# ADR 0001: Transit Provider Strategy for London, Ontario

Status: Accepted  
Date: 2026-03-09

## Context
`transit` mode is currently placeholder behavior and does not use schedule-aware public transit data.

## Decision
Use OpenTripPlanner (OTP2) as the primary schedule-aware transit provider, backed by local GTFS and OSM data.

Fallback strategy:
1. Keep mock/unavailable fallback behavior for provider downtime or feed issues.
2. Preserve normalized route contract so alternate providers can be added later without UI refactors.

## Candidates considered
1. OpenTripPlanner + GTFS + OSM (self-hosted).
2. Google transit API stack (managed).
3. TransitLand or equivalent GTFS-powered provider.
4. Regional open-data feed integration path.

## Decision criteria
1. Coverage quality for London, Ontario.
2. Itinerary detail quality (legs, transfers, times).
3. Cost/rate limits and operational risk.
4. Reliability and latency.
5. Licensing compatibility.

## Rationale
1. Avoids per-request API billing and vendor lock-in.
2. Provides schedule-aware itineraries with transfer support.
3. Fits planned adapter architecture and normalized response model.
4. Acceptable tradeoff: higher operational complexity (hosting/feed refresh).

## Consequences (expected)
- Positive: accurate transit ETAs and route legs.
- Negative: added provider complexity and failure-mode handling.

## Follow-up
1. Implement `getTransitRouteEstimate` adapter against OTP (`TR-003`).
2. Add transit unavailable fallback UX (`TR-004`/`TR-005`).
3. Add feed refresh and health-check operational notes.
