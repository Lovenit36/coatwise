import test from 'node:test';import assert from 'node:assert/strict';
import {assess,evaluateJob} from '../src/engine.mjs';
import {byId,catalogue} from '../src/catalogue.mjs';
import {localToUTC} from '../src/time.mjs';
import {verifyExtraction,approvedUploadToPaint} from '../src/ai.mjs';
import {getForecast} from '../src/weather.mjs';
const H=3600000;
const berlinStart=Date.parse('2026-11-03T08:00:00Z'); // 09:00 CET
function forecast(temps=()=>9, opts={}){
 return {location:'Berlin, Germany',timezone:'Europe/Berlin',fetchedAt:new Date().toISOString(),hours:Array.from({length:96},(_,i)=>({at:berlinStart+i*H,temp:temps(i),humidity:65,precip:opts.rain&&i===2?.9:0,wind:8,precipProbability:12}))};
}
const job=(paintId='sylitol',surface='mineral_render')=>({dateTime:'2026-11-03T09:00',durationHours:4,surface,paintId});
test('official catalogue has at least 8 sourced products across Caparol, KEIM and cold-weather brands',()=>{
 assert.ok(catalogue.length>=8);assert.deepEqual(new Set(catalogue.map(x=>x.brand)),new Set(['Caparol','KEIM','Sandtex Trade','Zinsser']));
 for(const p of catalogue){assert.match(p.source,/^https:\/\//);assert.ok(p.evidence.temp&&p.evidence.dry&&p.evidence.surface);assert.ok(p.min!==null);}
 assert.equal(byId('sylitol').min,8);assert.equal(byId('muresko').min,5);assert.equal(byId('muresko').recoatHours,6);assert.equal(byId('soldalit').referenceHours,null);
});
test('hourly low temperature during application triggers conflict',()=>{
 const r=assess(byId('sylitol'),job(),forecast(i=>i===2?6:10));
 assert.equal(r.status,'conflict');assert.ok(r.conflicts.some(x=>x.code==='temp_low'&&x.phase==='application'&&x.at===berlinStart+2*H));
});
test('hourly low overnight temperature during drying triggers conflict, not missed',()=>{
 const r=assess(byId('sylitol'),job(),forecast(i=>i===15?4:10));
 assert.ok(r.conflicts.some(x=>x.code==='temp_low'&&x.phase==='drying screening'&&x.at===berlinStart+15*H));
});
test('within numeric limits never results in unconditional safe verdict',()=>{
 const r=assess(byId('muresko'),job('muresko'),forecast(()=>15));
 assert.equal(r.status,'conditional');assert.equal(r.conflicts.length,0);assert.ok(r.unknown.some(x=>x.code==='substrate_temp'));assert.ok(r.unknown.some(x=>x.code==='rain_unknown'));
});
test('documented candidate alternatives improve Sylitol 8C case without promising safety',()=>{
 const r=evaluateJob(job(),forecast(i=>i===15?7:9));
 assert.equal(r.selected.status,'conflict');assert.ok(r.alternatives.some(a=>a.paint.id==='muresko'));
 assert.ok(r.alternatives.every(a=>a.conflicts.length===0&&a.status==='conditional'));
});
test('incompatible surface never yields a recommended alternative',()=>{
 const r=evaluateJob(job('sylitol','wood'),forecast(i=>i===1?2:10));
 assert.equal(r.selected.status,'conflict');assert.equal(r.alternatives.length,0);
});
test('unknown full cure duration remains unknown even when recoat reference is screened',()=>{
 const r=assess(byId('soldalit'),job('soldalit'),forecast(()=>12));
 assert.equal(r.screeningHours,12);assert.ok(r.unknown.some(x=>x.code==='dry_unknown'));
});
test('unavailable rain-protection hours are never inferred from recoat times',()=>{
 const r=assess(byId('muresko'),job('muresko'),forecast(()=>17,{rain:true}));
 assert.ok(r.conflicts.some(x=>x.code==='rain_during_work'));
 assert.ok(r.unknown.some(x=>x.code==='rain_unknown'));
});
test('incomplete forecast is marked unverified',()=>{
 const short=forecast(()=>12);short.hours=short.hours.slice(0,8);
 const r=assess(byId('muresko'),job('muresko'),short);
 assert.equal(r.coverageComplete,false);assert.ok(r.unknown.some(x=>x.code==='forecast_gap'));
});
test('missing hourly temp cannot be treated as acceptable',()=>{
 const f=forecast(()=>11);f.hours[3].temp=null;
 assert.ok(assess(byId('muresko'),job('muresko'),f).unknown.some(x=>x.code==='temp_missing'));
});
test('DST gap and overlap are rejected; normal date maps to UTC',()=>{
 assert.equal(localToUTC('2026-11-03T09:00','Europe/Berlin'),berlinStart);
 assert.throws(()=>localToUTC('2027-03-28T02:30','Europe/Berlin'),/does not exist/);
 assert.throws(()=>localToUTC('2027-10-31T02:30','Europe/Berlin'),/occurs twice/);
 assert.throws(()=>localToUTC('2026-02-30T09:00','Europe/Berlin'),/Invalid/);
});
test('uploaded extraction numeric requirement without exact quoted evidence is discarded',()=>{
 const text='Exterior coating. Processing temperature should be at least +5 °C; keep the wall dry during application. Extra filler information.'.repeat(3);
 const raw={product_name:'Example coat',manufacturer:'Example',application_temp_min_c:5,application_temp_max_c:30,drying_temp_min_c:null,drying_temp_max_c:null,rain_protection_hours:6,recoat_hours_reference:null,source_evidence:[{field:'application_temp_min_c',quote:'Processing temperature should be at least +5 °C'},{field:'rain_protection_hours',quote:'does not appear in document'}],notes:''};
 const r=verifyExtraction(raw,text);
 assert.equal(r.application_temp_min_c,5);assert.equal(r.application_temp_max_c,null);assert.equal(r.rain_protection_hours,null);
});
test('uploads require explicit review; never claim approved substrate',()=>{
 const x={product_name:'Sample',manufacturer:'Brand',application_temp_min_c:5,application_temp_max_c:25,drying_temp_min_c:null,drying_temp_max_c:null,recoat_hours_reference:12};
 assert.throws(()=>approvedUploadToPaint(x),/approve/);
 const p=approvedUploadToPaint({...x,userApproved:true});assert.equal(p.subgrades.length,0);assert.equal(p.referenceHours,null);
});
test('weather provider error is propagated, not silently turned into sample data',async()=>{
 const fetcher=async()=>({ok:false,status:503});
 await assert.rejects(getForecast('Berlin',{fetcher}),/503/);
});
test('weather adapter parses hour timestamps and timezone from real API response shape',async()=>{
 const hrs=[1730649600,1730653200,1730656800];
 const fetcher=async u=>({ok:true,json:async()=>String(u).includes('geocoding')?{results:[{name:'Berlin',country_code:'DE',latitude:52.52,longitude:13.4,timezone:'Europe/Berlin'}]}:{timezone:'Europe/Berlin',hourly:{time:hrs,temperature_2m:[6,7,8],relative_humidity_2m:[65,65,65],precipitation:[0,0,0],precipitation_probability:[10,10,10],wind_speed_10m:[5,5,5]}}});
 const r=await getForecast('Berlin, Germany',{fetcher});assert.equal(r.hours.length,3);assert.equal(r.hours[0].temp,6);assert.equal(r.location,'Berlin, Germany');
});
