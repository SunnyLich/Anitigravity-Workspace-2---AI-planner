# ADR 0001: Transit Provider Strategy for London, Ontario

Status: Proposed  
Date: 2026-03-09

## Context
`transit` mode is currently placeholder behavior and does not use schedule-aware public transit data.

## Decision to make
Select a primary transit provider and fallback approach for real schedule-aware routing.

## Candidates
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

## Consequences (expected)
- Positive: accurate transit ETAs and route legs.
- Negative: added provider complexity and failure-mode handling.

## Follow-up
After provider selection:
1. Define normalized transit response contract.
2. Implement `getTransitRouteEstimate` adapter.
3. Add transit unavailable fallback UX.
