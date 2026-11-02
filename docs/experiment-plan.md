# Plancraft GTM assignment — Experiment 1
**Tool:** CoatWise / AI Paint Selection & Weather Advisor  
**Status:** runnable local prototype; live external weather / AI credentials and deployment not verified in this offline build environment.  
**Date:** 1 November 2026

## Recommendation
I would launch this experiment first because the problem is narrow, recurring and easy to explain to an exterior painting business. A painter can compare a particular coating's manufacturer limits against hourly weather through a reference drying interval, then inspect conditional alternatives if a documented conflict is found. The main uncertainty is whether this insight changes real-world behaviour enough to produce qualified interest in Plancraft. The next step is to configure the actual services, publish a legally compliant live link, and observe real painters rather than report synthetic conversions.

## The five assignment questions

1. **Hypothesis.** Exterior painters who receive a manufacturer-specific weather assessment are more likely to finish the task and explore Plancraft than visitors offered a generic weather check. Our assumption is that avoiding rework, delays and coating mistakes is materially useful; it has not yet been validated with target customers.
2. **Funnel + metric.** Acquisition → engagement → Plancraft consideration. Primary: **unique qualified Plancraft CTA clickers / unique result viewers**. Secondary: landing sessions, starts, report generation, report exports and interviews. Outbound CTA clicks are **not** proof of registration or demo bookings.
3. **Smallest test.** First conduct a screen-share/site-visit usability test with **3–5 practicing exterior painters** from distinct businesses if possible, using a real job or a clearly labeled fictional scenario and the verified catalogue. Record first-try completion, time, key objections, and self-reported job relevance. If a public campaign is permitted, drive small targeted traffic to the landing URL and measure the actual funnel events.
4. **Thinking and tradeoffs.** Manufacturer sources and deterministic rules control technical findings; AI extracts uploaded specs and can generate an evidence-constrained explanation. Six curated products are tractable; generic support for all brands is not. No manufacturer fixed rainproof duration is invented. Forecast air temperature is not the painted wall temperature. A lightweight dependency-free Node build was chosen over the blueprint's recommended Next.js/Supabase stack to enable verifiable local execution without package installation; a durable analytics service and live deployment remain launch prerequisites.
5. **Success / kill threshold.** Provisional usability target: **at least 3 of 5** painters complete independently and **at least 2 of 5** find it useful for a genuine job decision. Provisional public CTA target: **5%** of relevant result viewers, subject to adequate sample size and proper attribution. Revise/kill if hallucinated technical facts, false-positive alternate recommendations, or consistently weak user relevance occur. Low traffic = inconclusive, not failure.

## Demonstrated vs not demonstrated

### Implemented and tested locally
- Six source-backed paint records from Caparol and KEIM; published sources cited within each result.
- Job date, local timezone and duration; per-hour temperature and precipitation comparison across application/reference drying.
- Rule engine for conflicts/uncertainties, substrate matching and alternative candidates.
- Parsing of Open-Meteo geocoding/forecast **response contracts with mocked provider responses**.
- AI request/response contract tested using a **mocked AI service**, with numerical quote verification.
- Text-based PDF ingestion tested against a **synthetic, explicitly labeled PDF fixture**.
- API responses, rate limiting path, origin checking, authenticated stats and events tests.
- Desktop/mobile browser UI interactions tested with **mocked API responses**.

### Still unverified; must not be reported as completed
- A publicly accessible hosted URL and HTTPS deployment.
- External real-time weather request from the deployed application (this workspace blocks outbound network).
- A live OpenAI model call using your server-side credential.
- Live PDF extraction on the chosen cloud host (depends on installing Poppler).
- Persistent multi-instance event retention or commercial licensing of Open-Meteo for promotional acquisition.
- Actual interviews, real campaign traffic, qualified leads or Plancraft conversions.

## Data handling
An anonymous session ID lives in browser sessionStorage, not an account. Server analytics logs event name, anonymous session ID, coarse UTM source and timestamps (no addresses or uploaded datasheet contents). The JSONL log prunes entries older than 30 days on subsequent event writes. Hosted service access logs may separately log IP addresses; publish a proper privacy notice and configure hosting retention before inviting public users. Uploaded PDFs are processed transiently and removed immediately after extraction; their text is sent to the configured AI service only when the uploader requests extraction.

## Three verification layers
1. **Source verification:** Manufacturer sheets were compared manually to entries, with missing limits explicitly null.
2. **Automated tests:** 29+ local tests on engine, timezone, exact PDF text, AI contract, API, analytics and failure paths.
3. **Browser verification:** Responsive UI and result/download interactions rendered under Chromium using mocked provider data, not misrepresented as real weather.

**Submission result:** Not measured. No painter feedback, CTA traffic figures or public URL can truthfully be claimed yet.
