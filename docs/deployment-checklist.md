# Deployment + triplicate verification checklist

## Before deployment
- [ ] Run `npm test` (expect 34 tests, including signed data and AI mock-contract tests)
- [ ] Confirm `npm start` launches and `/api/health` returns JSON
- [ ] Confirm `.env` never enters Git or build artifacts
- [ ] Confirm product sources remain live, exact and manufacturer-hosted
- [ ] Confirm PDF text extraction utility exists (production Dockerfile installs it)

## After setting your own API key on internet-connected hosting
- [ ] Check `GET /api/health` shows `aiReady:true`
- [ ] Submit Germany location, future job start, 1–16 h duration, surface and real paint
- [ ] Confirm forecast retrieval timestamp/location/timezone are fresh and plausible
- [ ] Independently inspect the exact original manufacturer datasheet values
- [ ] Test application min-temperature conflict and overnight drying conflict
- [ ] Test under-limit false positives do not produce a green safety guarantee
- [ ] Test alternatives against supported substrate and manufacturer source links
- [ ] Submit a real text-based datasheet PDF and check exact quoted lines
- [ ] Confirm scanned PDF fails honestly; file-size restrictions enforced
- [ ] Verify AI chat answers stay within the signed report; try tampering and confirm rejection
- [ ] Confirm weather outage shows error instead of generated numbers
- [ ] Test German DST transitions and near-horizon dates
- [ ] Test calendar/history after a browser refresh (local device only)
- [ ] Verify print-to-PDF and JSON download
- [ ] Verify `plancraft_cta_clicked` records only after a real click
- [ ] Test mobile screens and keyboard tab navigation
- [ ] If running a commercial campaign, use a commercially licensed weather provider
- [ ] For durable experiment results, use a persistent event volume and do not reset it during test

## Evidence and honesty
- Functional tests may use labelled synthetic weather fixtures. **Never label these as live forecasts or actual market results.**
- Independent real painter validation (3–5 tradespeople) has not yet happened.
- Public deployment is not complete until a live HTTPS URL and outgoing API calls are verified from the owner's hosting account.
- A Plancraft outbound click does not prove registration or revenue.
