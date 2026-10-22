# Analytics

Feature id: `analytics` · Route: none (API: `POST /api/events`)

## What it does

Records anonymous usage so triage can see which features people actually use:

- `PageView` (client component) sends one `view` event each time a page is shown. Pages compose it with their feature id.
- Features call `track(featureId, action)` from `shared/lib/track` on interactions (for example `blob` + `poke`). That is the shared contract, so features never import this feature.
- `POST /api/events` validates the payload and inserts a row into `events` with the service role.

## Invariants

- No personal data: only `feature_id`, `action`, `path` (no query string or hash) and a timestamp. Unknown keys are stripped. No IP, user agent or cookie is stored.
- Only same-origin `application/json` POSTs are accepted (403 cross-site, 415 otherwise), so other sites can't inject events. At most 300 events per IP (IPv6: per /64) per hour (429).
- Bodies over 1 KB get 413; invalid payloads get 400. The DB also enforces the slug formats with CHECK constraints.
- The anon key cannot read or write `events`; only server code with the service role can insert.

## Structure

- `lib/event-payload.ts`: Zod schema and body parsing (pure, unit-tested)
- `server/handle-event-request.ts`: the route handler logic (server-only)
- `components/page-view.tsx`: page-view tracker (uses the allow-listed `useMountEffect`)
