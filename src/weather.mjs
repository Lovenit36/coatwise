// Live geocoding and hourly rain/temperature forecasts. Hourly precipitation and probabilities are model predictions, not a sensor at the wall. No fictional fallback.
// City names: Open-Meteo geocoding. Full German street/postcode addresses: OSM Nominatim.
// Public Nominatim usage: request-driven, no autocomplete, max 1 request/second, cached.
const HOUR=3600000;
const addressCache=new Map();
let nextAddressRequest=0;
let addressQueue=Promise.resolve();
async function fetchJSON(url, fetcher=fetch, headers={}) {
 let res;
 try {res=await fetcher(url,{signal:AbortSignal.timeout(12000),headers:{accept:'application/json',...headers}});}
 catch {throw new Error('Location/weather service could not be reached. Check internet access and try again.');}
 if (!res.ok) throw new Error(`External data provider returned HTTP ${res.status}.`);
 try{return await res.json();}catch{throw new Error('Location/weather service sent an unreadable response.');}
}
const validPlace=p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon))&&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lon))<=180;
function isDetailedAddress(s){return /\b\d{5}\b/.test(s)||/\b(?:straße|strasse|str\.?|allee|weg|platz|damm|ring|ufer|chaussee|street|road)\b/i.test(s)||/\b\d{1,4}\s*[a-z]?\s*,/.test(s);}
async function nominatim(location,{fetcher=fetch}={}){
 const key=location.toLocaleLowerCase('de').trim();
 const cached=addressCache.get(key);if(cached&&cached.expire>Date.now())return cached.place;
 // Queue all uncached lookups globally to respect the public endpoint's <= 1 request/sec limit.
 const execute=async()=>{
  const wait=Math.max(0,nextAddressRequest-Date.now());if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
  nextAddressRequest=Date.now()+1150;
  const base=process.env.NOMINATIM_URL||'https://nominatim.openstreetmap.org/search';
  const url=`${base}?${new URLSearchParams({q:location,format:'jsonv2',addressdetails:'1',limit:'5',countrycodes:'de'})}`;
  const contact=process.env.GEOCODER_CONTACT?`; contact: ${process.env.GEOCODER_CONTACT}`:'';
  const results=await fetchJSON(url,fetcher,{'User-Agent':`Coatwise-Paint-Weather-Advisor/1.0 (independent job-specific prototype${contact})`});
  const expectedNumber=location.match(/(?:^|\s)(\d{1,4}[a-z]?)(?=\s*,|\s+\d{5}|\s+[A-ZÄÖÜ]|$)/i)?.[1]?.toLowerCase();
  const expectedPostcode=location.match(/\b\d{5}\b/)?.[0];
  const candidate=(Array.isArray(results)?results:[]).find(r=>validPlace(r)&&r.address?.country_code==='de'&&(!expectedNumber||String(r.address?.house_number||'').toLowerCase()===expectedNumber)&&(!expectedPostcode||String(r.address?.postcode||'')===expectedPostcode));
  if(!candidate)throw new Error(expectedNumber?'This exact house number and postcode could not be verified. Check the address, or enter Berlin for a city-level forecast.':'Street or postcode not found in Germany. Check the spelling or try a city.');
  const place={name:candidate.display_name,latitude:Number(candidate.lat),longitude:Number(candidate.lon),precision:candidate.address?.house_number?'address':'street/postcode',geocoder:'OpenStreetMap Nominatim'};
  addressCache.set(key,{place,expire:Date.now()+24*HOUR});
  if(addressCache.size>500){const first=addressCache.keys().next().value;addressCache.delete(first);}
  return place;
 };
 const work=addressQueue.then(execute,execute);addressQueue=work.catch(()=>{});return work;
}
async function cityPlace(query,fetcher){
 const geo=await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({name:query,count:'10',language:'en',format:'json',countryCode:'DE'})}`,fetcher);
 const p=(geo.results||[]).find(x=>x.country_code==='DE'&&Number.isFinite(x.latitude)&&Number.isFinite(x.longitude)&&x.timezone);
 if(!p)throw new Error('City not found in Germany. Try Berlin, Hamburg, or enter a full street address.');
 return {name:[p.name,p.admin1,'Germany'].filter(Boolean).join(', '),latitude:p.latitude,longitude:p.longitude,precision:'city',geocoder:'Open-Meteo'};
}
export async function resolveLocation(location,{fetcher=fetch}={}){
 if(typeof location!=='string'||location.trim().length<2||location.length>160)throw new Error('Enter a German city, postcode or full street address (maximum 160 characters).');
 const query=location.trim().replace(/,?\s*(germany|deutschland|de)\s*$/i,'').trim();
 if(!query||query.length<2)throw new Error('Enter a German job location.');
 return isDetailedAddress(query)?nominatim(query,{fetcher}):cityPlace(query,fetcher);
}
const val=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
export async function getForecast(location,{fetcher=fetch}={}){
 const place=await resolveLocation(location,{fetcher});
 const params=new URLSearchParams({latitude:String(place.latitude),longitude:String(place.longitude),hourly:'temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,wind_speed_10m',forecast_days:'16',timeformat:'unixtime',timezone:'auto'});
 const key=process.env.WEATHER_API_KEY;if(key)params.set('apikey',key);
 const host=key?'https://customer-api.open-meteo.com':'https://api.open-meteo.com';
 const raw=await fetchJSON(`${host}/v1/forecast?${params}`,fetcher);
 if(!raw.hourly||!Array.isArray(raw.hourly.time)||!raw.timezone)throw new Error('Weather service returned an incomplete forecast.');
 const h=raw.hourly;
 for(const k of ['temperature_2m','relative_humidity_2m','precipitation','precipitation_probability','wind_speed_10m'])if(!Array.isArray(h[k])||h[k].length!==h.time.length)throw new Error(`Weather data missing: ${k}`);
 const hours=h.time.map((t,i)=>({at:t*1000,temp:val(h.temperature_2m[i]),humidity:val(h.relative_humidity_2m[i]),precip:val(h.precipitation[i]),precipProbability:val(h.precipitation_probability[i]),wind:val(h.wind_speed_10m[i])}));
 if(hours.some((r,i)=>!Number.isFinite(r.at)||(i&&r.at-hours[i-1].at!==HOUR)))throw new Error('Forecast timestamps are missing or irregular.');
 return {location:place.name,locationPrecision:place.precision,geocoder:place.geocoder,latitude:place.latitude,longitude:place.longitude,timezone:raw.timezone,fetchedAt:new Date().toISOString(),hours};
}
