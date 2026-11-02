import {getForecast} from '../src/weather.mjs';
import {parseJobWithAI} from '../src/conversation.mjs';

const location = process.env.SMOKE_LOCATION?.trim() || 'Berlin';
const model = process.env.OPENAI_MODEL?.trim() || 'gpt-6.1-sol';
let failed=false;

console.log('Coatwise live API smoke test (real requests; no mock data)');
console.log(`Weather source: Open-Meteo ${process.env.WEATHER_API_KEY ? 'commercial API' : 'free evaluation API'}`);
console.log(`AI model: ${model}\n`);

try {
  const f = await getForecast(location);
  if (!f.hours?.length || !f.fetchedAt) throw Error('Forecast was empty.');
  console.log(`[PASS] Weather API: ${f.location} (${f.timezone}); received ${f.hours.length} genuine hourly forecast records; fetched ${f.fetchedAt}.`);
} catch (error) {
  failed=true;
  console.error(`[FAIL] Weather API: ${error.message}`);
}

if (!process.env.OPENAI_API_KEY?.trim()) {
  failed=true;
  console.error('[FAIL] OpenAI API: OPENAI_API_KEY is missing from .env.');
} else {
  try {
    const result = await parseJobWithAI('Painting sound mineral render in Berlin with Caparol Muresko for four hours.');
    if (!result.fields || result.fields.location?.toLowerCase()!=='berlin' || result.fields.paintId!=='muresko') {
      throw Error(`AI responded but did not recognize the supplied job reliably. Received: ${JSON.stringify(result.fields)}`);
    }
    console.log(`[PASS] OpenAI API: model ${model} responded to a real request and extracted location + Caparol Muresko.`);
    console.log('       A successful extraction means the key, model access, and Chat Completions request work.');
  } catch (error) {
    failed=true;
    console.error(`[FAIL] OpenAI API: ${error.message}`);
  }
}

console.log('\n'+(failed?'One or more live services failed. Review the messages above.':'Both live services passed. You can now test a full job in the browser.'));
if (failed) process.exitCode=1;
