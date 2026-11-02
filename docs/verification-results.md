# Coatwise v2 verification record — 1 November 2026

## Round 1 — manufacturer correctness and engine
- Cross-checked key Caparol and KEIM limits against official manufacturer publications, including current KEIM Granital version 09/2026.
- Distinguished +5°C Caparol ThermoSan NQG from the example mockup's unverified 2°C claim; rejected numeric 80% relative humidity limit not substantiated in Muresko.
- Verified the catalogue only uses manufacturer-backed claims; unknown maxima/rain-resistance remain `null`.
- Automated tests included low temperature in application/drying, accepted numerical boundaries, DST ambiguity, provider outages and no fabricated alternatives.

## Round 2 — backend, PDF, AI and security
- Verified text-only PDF extraction using an actual generated PDF fixture; invalid/scanned content rejected.
- Verified OpenAI extraction and explanation JSON shapes with mocked provider responses, including quote verification and rejection of unsupported numbers.
- Verified signed uploaded datasheet claims cannot be replaced by tampered client values; report Q&A uses a signed evidence context.
- Mocked complete API flow: geocoding -> forecast -> engine -> alternatives -> result, without claiming that mocked data was live.
- Verified source field validation, rate limit and origin protection.

## Round 3 — browser and deploy readiness
- Playwright + Chromium browser QA at 1440px desktop and 390px mobile with the real local application server and **test-only synthetic upstream weather fixture**. Blank initial inputs, full user form, conflict result, four hour cards, at least two conditional alternative cards, source modal, saved assessment history, calendar and restored snapshot passed. No page JavaScript exceptions, no horizontal overflow.
- All **34 automated tests passed in three consecutive runs**, with zero failures.
- `npm start` launched on port 3023. `GET /api/health` returned `status:ok`, version 2.0.0 and six catalogue entries.

## Not verified here
- **Live** Open-Meteo/geocoding or OpenAI request: outbound DNS/network access is restricted in this runtime. Credentials were not provided, and no external API success is claimed.
- Live public HTTPS deployment or durable database hosting: requires the user to connect a hosting/account and set environment secrets.
- Real painter interview, real signup attribution or business growth: not measured. Do not claim these as achieved.

For external go-live verification use `docs/deployment-checklist.md`.
