import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const nativeFetch=global.fetch;
const temp=await mkdtemp(join(tmpdir(),'coatwise-v2-'));
process.env.NODE_ENV='test';process.env.EVENTS_DIR=temp;process.env.OPENAI_API_KEY='test-mocked-key';
const {handler}=await import('../server.mjs');
const start=Math.floor(Date.now()/86400000)*86400;
const localDate=new Date(Date.now()+2*86400000);
const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(localDate).map(x=>[x.type,x.value]));
const dateTime=`${parts.year}-${parts.month}-${parts.day}T09:00`;
const pdfText='Manufacturer Sheet: Minimum application and drying temperature +8 °C, maximum +30 °C. The environmental conditions apply during application and drying. This product is used as an exterior facade coating on mineral render. Please check preparation, climate, dryness, and manufacturer guidance.';
let aiCalls=0;
global.fetch=async(input,options={})=>{
 const url=String(input);
 if(url.includes('geocoding-api'))return {ok:true,json:async()=>({results:[{name:'Berlin',country_code:'DE',latitude:52.52,longitude:13.41,timezone:'Europe/Berlin'}]})};
 if(url.includes('/forecast'))return {ok:true,json:async()=>({timezone:'Europe/Berlin',hourly:{time:Array.from({length:384},(_,i)=>start+i*3600),temperature_2m:Array.from({length:384},()=>6),relative_humidity_2m:Array.from({length:384},()=>70),precipitation:Array.from({length:384},()=>0),precipitation_probability:Array.from({length:384},()=>0),wind_speed_10m:Array.from({length:384},()=>4)}})};
 if(url.includes('api.openai.com')){
  aiCalls++;
  const body=JSON.parse(options.body);
  const kind=body.response_format?.json_schema?.name;
  let payload;
  if(kind==='technical_paint_extraction')payload={product_name:'Fixture product',manufacturer:'Sample manufacturer',application_temp_min_c:8,application_temp_max_c:30,drying_temp_min_c:8,drying_temp_max_c:30,rain_protection_hours:null,recoat_hours_reference:null,source_evidence:[{field:'application_temp_min_c',quote:'Minimum application and drying temperature +8 °C'},{field:'application_temp_max_c',quote:'maximum +30 °C'},{field:'drying_temp_min_c',quote:'Minimum application and drying temperature +8 °C'},{field:'drying_temp_max_c',quote:'maximum +30 °C'}],notes:'Needs installer verification'};
  else if(kind==='paint_explanation')payload={explanation:'The forecast air temperature is below the documented paint limit. Check the manufacturer source and measure the wall temperature.'};
  else if(body.messages[0].content.includes('Extract strictly explicit job fields'))payload={fields:{location:'Berlin',dateTime,durationHours:4,surface:'mineral_render',paintId:'sylitol'},note:'Check form values before analysing.'};
  else payload={answer:'The report records a temperature conflict against the manufacturer specification. The measured substrate temperature remains unknown.'};
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(payload)}}]})};
 }
 throw new Error('Unexpected mocked external URL: '+url);
};
const server=createServer(handler);await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const base=`http://127.0.0.1:${server.address().port}`;
async function post(path,data){const r=await nativeFetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:r.status,body:await r.json()}}
const job={location:'Berlin',dateTime,durationHours:4,surface:'mineral_render',paintId:'sylitol'};
function context(r){return {job:r.job,forecast:{location:r.forecast.location,timezone:r.forecast.timezone,fetchedAt:r.forecast.fetchedAt},selected:{status:r.selected.status,paint:r.selected.paint,conflicts:r.selected.conflicts.slice(0,25),cautions:r.selected.cautions.slice(0,20),unknown:r.selected.unknown.slice(0,25),hours:r.selected.hours.slice(0,100)},alternatives:r.alternatives.map(x=>({paint:x.paint,reason:x.reason,conflicts:x.conflicts,unknown:x.unknown.slice(0,6)})),decision:r.decision}}
test('AI-enabled catalogue assessment is signed and chat reads verified evidence',async()=>{
 const r=await post('/api/check',job);assert.equal(r.status,200,JSON.stringify(r.body));assert.match(r.body.contextSignature,/^[a-f0-9]{64}$/);assert.equal(r.body.selected.status,'conflict');
 const q=await post('/api/chat',{question:'Why is this paint unsuitable?',result:context(r.body),reportSignature:r.body.contextSignature});assert.equal(q.status,200,JSON.stringify(q.body));assert.match(q.body.answer,/temperature conflict/);
 const forged=context(r.body);forged.selected.paint.temp.min=-50;
 const invalid=await post('/api/chat',{question:'Can I paint?',result:forged,reportSignature:r.body.contextSignature});assert.equal(invalid.status,403);
});
test('signed chat checks seven new dates using fresh forecast and rejects forged job location',async()=>{
 const r=await post('/api/check',job);assert.equal(r.status,200);
 const ctx=context(r.body);
 const question=`Check entire week after ${Number(job.dateTime.slice(8,10))}th and other paints`;
 const result=await post('/api/chat',{question,result:ctx,reportSignature:r.body.contextSignature});
 assert.equal(result.status,200,JSON.stringify(result.body));
 assert.equal(result.body.week.rows.length,7);
 assert.ok(result.body.week.rows.every(day=>typeof day.status==='string'));
 const forged=context(r.body);forged.job.location='Munich';
 const reject=await post('/api/chat',{question,result:forged,reportSignature:r.body.contextSignature});
 assert.equal(reject.status,403);
});
test('AI natural-language intake only returns documentable fields',async()=>{
 const r=await post('/api/parse-job',{question:'Use Sylitol in Berlin on mineral render for four hours starting Tuesday at 9:00.'});assert.equal(r.status,200);assert.equal(r.body.fields.paintId,'sylitol');assert.equal(r.body.fields.location,'Berlin');
});
test('AI-extracted datasheet values are signed, cannot be silently modified in browser',async()=>{
 const extracted=await post('/api/extract',{text:pdfText});assert.equal(extracted.status,200,JSON.stringify(extracted.body));assert.equal(extracted.body.extraction.application_temp_min_c,8);assert.ok(extracted.body.approvalToken);
 const forged=await post('/api/check',{...job,paintId:'uploaded',uploadedPaint:{product_name:'Sample',application_temp_min_c:-99,userApproved:true},approvalToken:extracted.body.approvalToken+'tamper'});assert.equal(forged.status,400);
 const valid=await post('/api/check',{...job,paintId:'uploaded',approvalToken:extracted.body.approvalToken});assert.equal(valid.status,200,JSON.stringify(valid.body));assert.equal(valid.body.selected.paint.temp.min,8);assert.match(valid.body.selected.paint.name,/Fixture product/);
});
test('missing and invalid input cannot trigger a fake result',async()=>{const r=await post('/api/check',{location:'Berlin',paintId:'sylitol'});assert.equal(r.status,400);assert.ok(!r.body.forecast);});
test('test server shutdown',async()=>{assert.ok(aiCalls>=4);global.fetch=nativeFetch;delete process.env.OPENAI_API_KEY;await new Promise(ok=>server.close(ok));await rm(temp,{recursive:true,force:true});});
