# Coatwise v3 — AI Paint & Weather Advisor

Updated interface: a compact **How it works** card below the chat panel explains the 3 steps and physical site checks only before a successful assessment. It hides on results (including restored saved reports), and reappears when starting a new assessment. No weather or datasheet data is invented by the card.

A runnable, independently branded, evidence-first GTM experiment for professional exterior painters in Germany. Built to match the supplied Plancraft-style dashboard reference without claiming Plancraft affiliation.

## Quick start — no npm packages or database needed

**Node.js 22+** and (for PDF uploads) the **`pdftotext` executable from Poppler** are required.

```bash
cp .env.example .env
# Put OPENAI_API_KEY=sk-... into .env using a local editor.
npm start
```

Open **http://localhost:3000**. The paint catalogue and forecast-checking functions can run without OpenAI, but **AI datasheet extraction, conversational job entry and open-ended report Q&A require `OPENAI_API_KEY`**. Never enter your API key into the browser, Git, or ChatGPT messages. Server reads `.env` directly when started via `npm start`.

**Install Poppler locally:** `brew install poppler` (Mac with Homebrew), or `sudo apt install poppler-utils` (Debian/Ubuntu). The included production Dockerfile already installs Poppler. A scanned/image-only PDF is explicitly rejected; text PDFs and pasted manufacturer text are supported.

### What happens for a real check

1. You enter a German **city/postcode**, real calendar date/time, actual duration, façade/substrate and a manufacturer paint. The application starts **with blank fields**—no made-up weather or prefilled demonstration dates.
2. The server queries **Open-Meteo Geocoding**, then the **Open-Meteo Hourly Weather Forecast API**, automatically using the returned location timezone. Requests can cover up to 16 forecast days. A job whose screening window extends past the forecast is rejected.
3. The deterministic engine compares **published product limits hour-by-hour** during application and reference drying/recoat screening. It flags conflicts, warnings and unknown site conditions. The app NEVER treats a lack of documented rain protection as proof of rain resistance. Air temperature is not measured wall/substrate temperature. This is a screening aid, not job approval.
4. A conflict triggers a substrate-filtered scan of documented paint candidates. They are **conditional possibilities**, not guaranteed compatible substitutes. The app shows verified manufacturer links and preparation limitations.
5. Optional AI returns an explanation of the **computed report**, never a new technical pass/fail value. Chat answers use the current server-signed report. Natural-language intake with AI can populate form fields, but the user must review them and click Check to fetch a real forecast.
6. You can export JSON, print/save a PDF using the browser's print-to-PDF function, save assessments locally in the browser calendar/history, and use a clearly labelled outbound link to Plancraft. Previous reports are snapshots with their original forecast retrieval timestamp—never silently refreshed.

### AI datasheet upload

Open **Have your own datasheet?**, choose a text PDF/TXT document (maximum 1.5 MB) or paste at least 120 characters. Click **Extract rules with AI**. Check the quoted manufacturer statements and explicitly confirm them. Extracted limits are signed by the server for one hour so a user cannot silently edit them in the browser before submission. The results remain marked as **user-reviewed** and the actual substrate fit as unverified. The original document is held only in temporary private server storage while text is extracted and then deleted; no persistent PDF repository is created.

## Real APIs / configuration

| Service | Environment variable | Need to supply? |
|---|---|---|
| OpenAI Chat Completions | `OPENAI_API_KEY` | **Yes**, for AI functionality |
| OpenAI model | `OPENAI_MODEL` | Optional, defaults to `gpt-4.1-mini` |
| Open-Meteo free evaluation | None | No key needed for **non-commercial prototyping** |
| Open-Meteo commercial API | `WEATHER_API_KEY` | **Required for commercial campaign/licensed use** |
| Server-signing persistence | `SIGNING_SECRET` | Strongly recommended on hosting (random 32+ bytes) |
| Analytics admin stats | `ADMIN_TOKEN` | Set a secret to enable `/api/stats` |
| Persistent events directory | `EVENTS_DIR` | Optional; use a host-mounted persistent volume for real campaign measurement |

When `WEATHER_API_KEY` exists, the app automatically uses Open-Meteo's `https://customer-api.open-meteo.com/v1/forecast` with its `apikey` parameter. The provider's free endpoint is for non-commercial evaluation only: https://open-meteo.com/en/pricing. Both geocoding and weather require an outbound network connection from the server.

### Deployment: Render Docker service

A ready-to-deploy `Dockerfile` and `render.yaml` are included. The operator still must own a Git repository and hosting account; this ZIP cannot deploy itself.

1. Put the extracted source in a GitHub repository **without `.env`**. The `.gitignore` keeps `.env` out.
2. In Render, create a service from this repository (or deploy the `render.yaml` Blueprint). Render uses the Dockerfile and installs Poppler for PDF extraction.
3. Add `OPENAI_API_KEY` in Render's **server environment variable settings**; do not paste it in frontend JavaScript. For a commercial campaign also add `WEATHER_API_KEY` from a licensed plan. Add permanent `SIGNING_SECRET` and `ADMIN_TOKEN` (Blueprint can generate them).
4. Check `/api/health`; test a **real** Germany-based future job; run an uploaded PDF through the complete flow; verify the resulting Plancraft outbound link and events.
5. Render free-instance filesystem is ephemeral, so if you need durable analytics use a paid persistent disk with `EVENTS_DIR` or connect a managed database. **Do not report campaign results as durable if the test data could disappear on restart.**

### API routes

| Route | What it does |
|---|---|
| `GET /api/catalogue` | Source-backed six-product catalogue, substrate categories |
| `GET /api/health` | Runtime readiness and whether AI is configured (never exposes secrets) |
| `POST /api/check` | Validate job, live forecast, deterministic checks, alternatives, optional AI explanation, signed chat context |
| `POST /api/extract` | Parse text or text-PDF, AI source-quote extraction, generate tamper-resistant approval token |
| `POST /api/parse-job` | AI-assisted natural-language job entry, no guessed values |
| `POST /api/chat` | Report-specific AI Q&A (or restricted deterministic replies without AI key) using a signed result |
| `POST /api/events` | Actual anonymous funnel events |
| `GET /api/stats` | Admin bearer token required; returns counters from actual events |

## Quality, security, limitations

* Run `npm test` for Node integration, weather boundary, manufacturer evidence, DST and security checks. Test fixtures **intentionally contain synthetic weather data**, and they never run in the public application. `tests/browser-fixture-server.mjs` is a **test-only** server on port 3001, not a production launcher.
* Browser-level desktop and mobile QA ran through the actual server routes with only the upstream APIs replaced by **labelled synthetic responses**. The checks cover empty states, form submission, status cards, alternatives, saved-calendar restoration, source dialog and horizontal overflow.
* Manufacturer facts verified against six official sources. Reopen the current document before committing to a job; public product sheets can change and may have variants/primers not included in this limited catalogue.
* There is no third-party login or persistent cross-device account. The **calendar and chat history are stored only in the same browser**, and can be erased in Saved Jobs. If the browser storage is cleared, the records disappear. A new server may invalidate signatures of old chat sessions; the stored results are still labelled archived.
* Anonymous event telemetry includes event name, session UUID, outcome and campaign source; no address, PDF content or conversation text is stored in the event file. Retention is 30 days. A CTA click does not prove a Plancraft signup or sale.
* No manufacturer or Plancraft integration or endorsement is represented. The front-end Plancraft CTA points to their public introduction page, not a working third-party API connection.
* External HTTP traffic from this build environment was blocked, so **end-to-end calls to live Open-Meteo and OpenAI were not executed here**. Local HTTP, deterministic engine, mocked upstream contracts, browser interactions and AI structured response validations were verified. To finish live verification, run the supplied production smoke checklist from your internet-connected computer or hosting instance with your own key. Do not report live API verification as already completed.

## Reference documents

See `docs/source-register.md` for the exact official technical documentation, `docs/experiment-plan.md` for the GTM experiment and `docs/deployment-checklist.md` for the deployment and safety gate. This project only implements **Idea #1** from the three-tool blueprint.
