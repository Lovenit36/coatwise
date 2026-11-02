# Manufacturer source register — verified 1 November 2026

This registry describes the **limited** documented catalogue; it does not establish substitution or primer/system compatibility. Current product sheets should always be reviewed for a live job. Numerical maxima not present in a sheet remain `null`.

| Product | Manufacturer source | Verified temperature information | Reference drying / recoating distinction |
|---|---|---|---|
| Caparol Muresko | https://www.caparol.de/produkte/capatect-fassaden-und-daemmtechnik/fassadenfarben/silacrylr-fassadenfarben/muresko | +5 to +30°C air/substrate during application **and** drying | recoatable ~6h and through-dry ~3d at 20°C/65% RH, **not** rainproof hours |
| Caparol AmphiSilan | https://www.caparol.de/produkte/farben/fassadenfarben/siliconharz-fassadenfarben/amphisilan | +5 to +30°C air/substrate during application **and** drying | recoating and full-drying are reference values, not rainproof ratings |
| Caparol ThermoSan NQG | https://www.caparol.de/produkte/farben/fassadenfarben/nqgr-fassadenfarben/thermosanr-nqgr | +5 to +30°C air/substrate during application **and** drying | recoatable ~12h and through-dry ~3d at 20°C/65% RH; not a 2°C coating |
| Caparol Sylitol Fassadenfarbe | https://www.caparol.de/produkte/farben/fassadenfarben/mineralfarben/sylitolr-fassadenfarbe | +8 to +30°C air/substrate during application **and** drying | recoating reference varies by conditions, with site checks necessary |
| KEIM Soldalit | https://www.keim.com/data/products/2555/723/TM_Soldalit_DE-DE.pdf | ≥5°C during application **and** drying; upper maximum not documented in the captured sheet | recoatable no earlier than 12h at 23°C/50% RH; no documented full-curing period |
| KEIM Granital | https://www.keim.com/documents/en-GB/723/TM_Granital_EN-EN.pdf | ≥5°C during application **and** drying; upper maximum not documented in the captured sheet | recoatable no earlier than 12h at 23°C/50% RH; no documented full-curing period. English PDF version 09/2026 |

## Explicitly rejected manufactured claims

* **"ThermoSan NQG works from 2°C"** — not supported by the verified German manufacturer page; the documented minimum in this catalogue is 5°C.
* **"Muresko humidity limit = 80%"** — no such numeric maximum was verified in its manufacturer sheet; high humidity is qualitatively discouraged.
* **"Recoatable after 6h" = "Rainproof after 6h"** — logically false without a rain-specific manufacturer statement.
* A temperature matched in an air forecast does not establish measured substrate temperature or actual curing completion.

Sources last reviewed via the manufacturers' online publications on 1 November 2026. Forecast API documentation: https://open-meteo.com/en/docs and geocoding https://open-meteo.com/en/docs/geocoding-api. Commercial terms: https://open-meteo.com/en/pricing.

## V8 — Rain resistance and cold-weather masonry paints (verified 2 Nov 2026)

- [Sandtex Trade 365 All Weather — manufacturer UK product information](https://www.sandtexpaints.com/uk/365-all-weather/): published application temperature as low as -10°C, shower-resistant after approximately 20 minutes; touch-dry 1–2 hours and recoat at 16 hours. This is not a heavy-rain guarantee. Verify the full current sheet, distribution and suitability for any German project.
- [Zinsser AllWeather Exterior Masonry Paint — manufacturer UK product information](https://zinsseruk.com/products/allweather-exterior-masonry-paint): published application temperature down to -5°C, showerproof after approximately 20 minutes; touch-dry 1–2 hours; recoat approximately 3 hours; full cure 7 days as a reference, not forecast-proof drying duration. Verify the exact full datasheet and German distribution.
- [Caparol Trocknungsbeschleuniger](https://www.caparol.de/en/product-range/paints/supplementary-products/additiv-fuer-die-kuehle-jahreszeit/trocknungsbeschleuniger): explicitly lists Muresko as supported; +1 to +10°C for air and substrate, early rainproof after about one hour. Product and system instructions still apply. Not for frozen or wet substrates.
- Open-Meteo includes hourly **precipitation** and **precipitation_probability**. Hourly forecasts cannot resolve a 20-minute shower arrival precisely, nor replace measuring wall wetness/temperature or distinguish all heavy-rain risks.
