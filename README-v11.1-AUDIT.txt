COATWISE v11.1 — INDEPENDENT RECHECK / REGRESSION PATCH
Date: 2026-11-02

What was actually checked:
- Both original v11 ZIP archives passed ZIP integrity validation.
- Clean project extraction followed by npm test: 98/98 passing before fixes.
- Reviewed weather rules, 7-day screening, chat routing, document indexing/cache,
  manufacturer retrieval, signed assessment flow, itinerary generator, and browser code.
- Found and corrected three concrete itinerary issues and one messaging issue:
  1. Schedules ending after 23:00 now return a clear validation error instead of crashing.
  2. "How many coats do I need?" is treated as a technical question, not a request
     for an automatically invented two-coat work plan.
  3. A weather-blocked coating on day one can be rescheduled on a following workday
     within the requested duration, and the initial blocked slot remains visibly marked.
  4. Half-hour job start times are preserved instead of rounded down.
  5. Generated summary no longer implies ALL future coats are blocked when a later
     suitable, conditional work slot was found.
- After fixes: 102/102 local automated tests passed.
- Started a local HTTP server and checked /, /api/health, /api/catalogue.
- All JavaScript syntax checks passed.

Important limitations:
- All external OpenAI and live manufacturer/weather service calls have NOT been
  independently executed with the user's API credentials. Automated tests mock them.
- v11's RAG is small-scale keyword/phrase retrieval over PDF/TXT chunks,
  not embedding-based vector search. Manufacturer sources are cached when fetched;
  arbitrary missing documents are not guaranteed to be found automatically.
- Painting plans are PROVISIONAL: the user specifies coat number and hours;
  a reference recoat interval is not a drying guarantee.
- Actual facade/wall temperature, moisture, dew point, humidity, protection, primer
  suitability, availability in Germany and regulations need independent checks.
- Local prototype has no production-grade multi-tenant authentication/isolation.

Install: Extract the CHANGED FILES package into the EXISTING v11 project root and
replace matching files. Or use FULL PROJECT in a separate directory.
Keep your own .env file and locally saved data. Run npm test then npm start.
