# Product Roadmap

Updated: 2026-03-16

## Positioning

This paid-version workspace starts from a working free-version baseline, but the product direction has changed. The next delivery cycle is centered on replacing the inherited Mapbox and OTP provider stack with Google Maps Platform so the paid app has a single managed map and routing foundation.

## Current baseline

The current application already provides:

- a functioning planner flow with map exploration, custom saved locations, and itinerary generation
- optimization modes that already handle opening hours, priorities, and time budgets
- inherited live-provider hooks that currently rely on Mapbox for road routing and OTP for transit-oriented flows
- a desktop packaging path, even though the inherited OTP setup still adds unnecessary operational complexity for the paid product

## Now

1. Replace the inherited map surface with Google Maps in the paid app.
2. Replace Mapbox and OTP route-estimation dependencies with Google-backed routing services.
3. Define a migration-safe provider contract so planner, itinerary, and optimization behavior remain stable during the swap.
4. Update configuration, documentation, and release planning around Google API keys, service enablement, quotas, and billing controls.

## Next

1. Migrate search, autocomplete, and reverse geocoding toward Google Places and Geocoding where they improve the paid UX.
2. Remove or hide OTP- and Mapbox-specific settings, copy, and operational assumptions from the paid build.
3. Revalidate route overlays, itinerary rendering, and optimization timing against Google responses.
4. Align desktop and hosted deployments around the same paid provider model.

## Later

1. Expand paid-only quality work around provider diagnostics, reliability, and usage telemetry.
2. Add stronger automated coverage for provider normalization and failure-mode handling.
3. Revisit broader onboarding simplification after the Google migration is complete.

## Non-goals for the current cycle

1. Further investment in the inherited OTP deployment path for the paid version.
2. Additional Mapbox-specific feature work beyond what is needed to bridge the migration.
3. Major new surfaces unrelated to provider migration, routing quality, or itinerary reliability.
