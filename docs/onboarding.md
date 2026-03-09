# Engineering Onboarding

## Quick start
1. Install dependencies:

```bash
npm install
```

2. Run dev server:

```bash
npm run dev
```

3. Validate baseline manually:
- Map and planner window render.
- POI overlay appears.
- Add 2+ places and run:
  - `Estimate Route Time`
  - `Optimize Schedule`
- Test both optimization modes in planner.

## Routing environment
- Mock mode (default):
  - `VITE_USE_MOCK_ROUTING=true`
- Real Mapbox mode:
  - `VITE_USE_MOCK_ROUTING=false`
  - `VITE_MAPBOX_ACCESS_TOKEN=...`

## Planning docs map
- Product priorities: `docs/roadmap.md`
- Workstream status: `planning/workstreams.yaml`
- Task backlog: `planning/backlog.json`
- Architecture context: `docs/architecture.md`
- Change history: `docs/changelog.md`
