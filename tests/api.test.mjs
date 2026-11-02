import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const nativeFetch=global.fetch;
const temp=await mkdtemp(join(tmpdir(),'coatwise-test-'));
process.env.NODE_ENV='test';process.env.EVENTS_DIR=temp;process.env.ADMIN_TOKEN='this-test-secret-only';
const {handler}=await import('../server.mjs');
let providerDown=false;
const d=new Date();d.setUTCDate(d.getUTCDate()+1);
const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'});
const pp=Object.fromEntries(formatter.formatToParts(d).map(x=>[x.type,x.value]));
const local=`${pp.year}-${pp.month}-${pp.day}T09:00`;
let day0=Math.floor(Date.now()/86400000)*86400;
global.fetch=async url=>{
 if(providerDown)return {ok:false,status:503};
 if(String(url).includes('geocoding-api'))return {ok:true,json:async()=>({results:[{name:'Berlin',country_code:'DE',latitude:52.52,longitude:13.41,timezone:'Europe/Berlin'}]})};
 if(String(url).includes('/forecast'))return {ok:true,json:async()=>{
  const time=Array.from({length:384},(_,i)=>day0+i*3600);
  return {timezone:'Europe/Berlin',hourly:{time,temperature_2m:time.map(()=>6),relative_humidity_2m:time.map(()=>65),precipitation:time.map(()=>0),precipitation_probability:time.map(()=>0),wind_speed_10m:time.map(()=>6)}};
 }};
 throw new Error('Unexpected external endpoint '+url);
};
const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
async function post(path,payload,headers={}){const r=await nativeFetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(payload)});return {status:r.status,data:await r.json()}}
const req={location:'Berlin',dateTime:local,durationHours:4,surface:'mineral_render',paintId:'sylitol'};
test('static HTML and API health return correct headers, catalogue, and no exposed secrets',async()=>{
 const r=await nativeFetch(base+'/');assert.equal(r.status,200);const body=await r.text();assert.match(body,/coatwise/i);assert.doesNotMatch(body,/OPENAI_API_KEY/);assert.match(r.headers.get('content-security-policy'),/default-src/);
 const c=await nativeFetch(base+'/api/catalogue');assert.ok((await c.json()).paints.length>=8);
 const h=await nativeFetch(base+'/api/health');assert.equal((await h.json()).aiReady,false);
});
test('end-to-end POST /api/check connects geocoding -> hourly forecast -> rules -> alternatives',async()=>{
 const r=await post('/api/check',req);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.selected.status,'conflict');assert.ok(r.data.selected.conflicts.length>0);assert.ok(r.data.alternatives.length>0);assert.equal(r.data.forecast.location,'Berlin, Germany');assert.equal(r.data.ai.status,'not_configured');
});
test('request beyond forecast coverage is rejected (no fabricated conditions)',async()=>{
 const later=new Date(Date.now()+24*86400000).toISOString().slice(0,16);
 const r=await post('/api/check',{...req,dateTime:later});assert.equal(r.status,400);assert.match(r.data.error,/16-day forecast/);
});
test('incorrect surface prevents alternative approval',async()=>{
 const r=await post('/api/check',{...req,surface:'wood'});assert.equal(r.status,200);assert.equal(r.data.alternatives.length,0);
});
test('weather provider failure returns an honest HTTP 503 and no synthetic forecast',async()=>{
 providerDown=true;try{const r=await post('/api/check',req);assert.equal(r.status,503);assert.match(r.data.error,/503/);assert.ok(!r.data.forecast);}finally{providerDown=false;}
});
test('AI extraction requires server key, never pretends to process PDF',async()=>{
 const r=await post('/api/extract',{text:'a'.repeat(200)});assert.equal(r.status,503);assert.match(r.data.error,/not configured/);
});
test('browser event endpoint accepts legitimate events; stats are secured',async()=>{
 const sessionId='123e4567-e89b-42d3-a456-426614174000';
 for(const event of ['landing_view','tool_started','result_generated','result_used','plancraft_cta_clicked'])assert.equal((await post('/api/events',{event,sessionId,source:'pilot'})).status,201);
 assert.equal((await nativeFetch(base+'/api/stats')).status,401);
 const r=await nativeFetch(base+'/api/stats',{headers:{Authorization:'Bearer this-test-secret-only'}});const s=await r.json();assert.equal(s.results,1);assert.equal(s.ctaClickers,1);assert.equal(s.ctaRate,1);assert.equal(s.uniqueSessions,1);
 const bad=await post('/api/events',{event:'lead_opt_in',sessionId});assert.equal(bad.status,400);
});
test('rejects cross-origin POST',async()=>{const r=await post('/api/check',req,{Origin:'https://attacker.example'});assert.equal(r.status,403)});
test('blocks traversal and missing static resources',async()=>{const r=await nativeFetch(base+'/nonexistent.js');assert.equal(r.status,404)});
test('cleanup',async()=>{global.fetch=nativeFetch;await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true})});
