# TripOptimizer User Guide

This guide is for App users.

If you are cloning the repository and running npm commands, that is a development workflow. Use `docs/onboarding.md` for that.

## What you need

- For the desktop app: Windows
- For the web app: a modern browser and a deployed web URL from the team

You do not need Node.js, npm, or a Mapbox token to use a packaged release.

## 1. Choose how you want to use it

### Desktop app

If you downloaded the app from GitHub, use the packaged Windows desktop builds from the GitHub Release assets.

Use one of these:

- `release/TripOptimizer Setup 1.0.0.exe` for the installer build
- `release/TripOptimizer 1.0.0.exe` for the portable build

Use the desktop version when you want:

- the easiest end-user path
- managed local OTP install and start controls
- a desktop-only local runtime for transit testing

### Web app

The web version is the same planner UI, but end users should open a hosted deployment URL.

If there is no hosted deployment URL yet, the desktop build is the correct end-user option.

The source-code repository itself is not the end-user install path.

## 2. Basic planner workflow

1. Search for a place in the search panel.
2. Add places to your trip.
3. Optionally set a start and destination.
4. Choose a travel mode such as walk, drive, or transit.
5. Use `Estimate Route Time` for a quick route estimate.
6. Use `Optimize Schedule` to generate a best-order itinerary.
7. Review the route on the map and the stop order in the itinerary panel.

## 3. Working without Mapbox

The default release path does not require Mapbox.

In no-token mode:

- the app still runs
- optimization still runs
- route timing is approximate instead of live road-network routing

## 4. Working with real transit

For schedule-aware transit, you need an OTP server.

Notes:

- The desktop app can manage a local OTP runtime through the Settings panel.
- The web app can only use OTP if it can already reach a running OTP server.
- If OTP is not available, the planner falls back to mock transit behavior.

## 5. Exporting results

From the itinerary window, users can export the itinerary view as:

- an image
- a PDF

## 6. Troubleshooting

If the app starts but routes look unrealistic:

- confirm you are not expecting live road-network routing without Mapbox
- approximate timings are expected in no-token mode

If transit does not return schedules:

- confirm OTP is running and reachable
- if you are using the web app, confirm the server is reachable from the browser environment
- if you are using the desktop app, check the Settings panel for OTP runtime status

If you expected to run from source code locally:

- that is a developer workflow, not an end-user workflow
- use `docs/onboarding.md` instead of this guide
