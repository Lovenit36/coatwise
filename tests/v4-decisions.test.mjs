import test from 'node:test';import assert from 'node:assert/strict';
import {resolveLocation,getForecast} from '../src/weather.mjs';
import {suggestWindows,decideNext} from '../src/plan.mjs';
import {evaluateJob} from '../src/engine.mjs';
import {byId} from '../src/catalogue.mjs';
import {localToUTC} from '../src/time.mjs';
const berlin='Europe/Berlin';
const date='2026-11-05T10:00';
const start=Math.floor(localToUTC('2026-11-03T00:00',berlin)/3600000)*3600000;
function forecastFor(tempFn,precipFn=()=>0){const hours=Array.from({length:384},(_,i)=>({at:start+i*3600000,temp:tempFn(i),humidity:65,precip:precipFn(i),precipProbability:0,wind:5}));return {location:'Berlin',timezone:berlin,locationPrecision:'city',fetchedAt:'2026-11-02T01:00:00.000Z',hours};}
const job={location:'Berlin',dateTime:date,durationHours:4,surface:'mineral_render',paintId:'muresko'};
test('exact German street address is resolved via Nominatim, with no city downgrade',async()=>{
 let addressCalls=0;
 const fetcher=async(url,opts)=>{if(String(url).includes('nominatim')){addressCalls++;assert.match(opts.headers['User-Agent'],/Coatwise/);return {ok:true,json:async()=>[{lat:'52.47',lon:'13.43',display_name:'Sonnenallee 221, Berlin',address:{country_code:'de',house_number:'221',postcode:'12059'}}]};}throw Error('unexpected');};
 const p=await resolveLocation('Sonnenallee 221, 12059 Berlin',{fetcher});assert.equal(p.precision,'address');assert.equal(p.latitude,52.47);
 const again=await resolveLocation('Sonnenallee 221, 12059 Berlin',{fetcher});assert.equal(again.longitude,13.43);assert.equal(addressCalls,1);
});
test('street house number mismatch is NOT treated as an exact address match',async()=>{
 const fetcher=async()=>({ok:true,json:async()=>[{lat:'52.47',lon:'13.43',display_name:'Sonnenallee 229, Berlin',address:{country_code:'de',house_number:'229',postcode:'12059'}}]});
 await assert.rejects(()=>resolveLocation('Sonnenallee 223, 12059 Berlin, Germany',{fetcher}),/house number/i);
});
test('city location retains existing free Open-Meteo city geocoding',async()=>{
 const fetcher=async url=>{assert.match(String(url),/geocoding-api.open-meteo/);return {ok:true,json:async()=>({results:[{country_code:'DE',name:'Berlin',admin1:'Berlin',latitude:52.5,longitude:13.4,timezone:berlin}]})};};
 const p=await resolveLocation('Berlin',{fetcher});assert.equal(p.precision,'city');
});
test('forecast request uses exact geocoded coordinates and never invents weather',async()=>{
 const fetcher=async(url)=>{
  if(String(url).includes('nominatim'))return {ok:true,json:async()=>[{lat:'52.47',lon:'13.43',display_name:'Sonnenallee 221, Berlin',address:{country_code:'de',house_number:'221',postcode:'12059'}}]};
  assert.match(String(url),/latitude=52.47/);assert.match(String(url),/longitude=13.43/);
  return {ok:true,json:async()=>({timezone:berlin,hourly:{time:[100,3700],temperature_2m:[5,6],relative_humidity_2m:[75,75],precipitation:[0,0],precipitation_probability:[10,10],wind_speed_10m:[3,3]}})};
 };
 const r=await getForecast('Sonnenallee 221, 12059 Berlin',{fetcher});assert.equal(r.hours[0].temp,5);assert.equal(r.locationPrecision,'address');
});
test('rescheduling proposes only fully screened windows with no worktime forecast rain',()=>{
 const f=forecastFor(i=>i<110?3:12);
 const r=evaluateJob(job,f);assert.ok(r.selected.conflicts.length);
 const next=suggestWindows(byId('muresko'),job,f);assert.ok(next.length>=1);assert.ok(next.every(w=>localToUTC(w.dateTime,berlin)>localToUTC(job.dateTime,berlin)));
 const decision=decideNext(job,r,f);assert.equal(decision.verdict,'reschedule_or_change_paint');assert.ok(decision.nextWindows.length);
 const wet=forecastFor(i=>i<110?3:12,()=>1);assert.deepEqual(suggestWindows(byId('muresko'),job,wet),[]);
});
test('a cold conflict without verified alternatives asks for a manufacturer sheet instead of inventing a paint',()=>{
 const cold=forecastFor(()=>3);const r=evaluateJob(job,cold);const d=decideNext(job,r,cold);
 assert.ok(d.alternatives.some(x=>x.min<0),'cold-weather sourced paints should now be suggested');assert.equal(d.nextWindows.length,0);assert.ok(d.specialistLeads[0].source.includes('caparol.de'));assert.match(d.specialistLeads[0].name,/Muresko/);
});
test('no conflict remains conditional, never becomes unconditional safe-to-paint approval',()=>{
 const f=forecastFor(()=>13);const r=evaluateJob(job,f);const d=decideNext(job,r,f);
 assert.equal(r.selected.status,'conditional');assert.equal(d.verdict,'conditional');assert.match(d.title,/site checks/i);
});
