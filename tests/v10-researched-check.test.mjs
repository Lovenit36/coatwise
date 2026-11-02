import test from 'node:test';
import assert from 'node:assert/strict';
import {checkResearchedPaint,retrieveManufacturerDocument,matchesResearchedProduct} from '../src/researched-check.mjs';
const source='https://www.sto.de/sheet/stocolor-dryonic.pdf';
const query='Find StoColor Dryonic official technical requirements and check this paint for my job';
const job={location:'Berlin',dateTime:'2026-11-05T10:00',durationHours:4,surface:'mineral_render',paintId:'muresko'};
function tds(){return 'StoColor Dryonic original technical information. Working air and wall temperature +5 to +30 degrees C. Drying air temperature +5 to +30 degrees C. Recoat after 24 hours at 20C and 65% humidity. Protect from rain. ' .repeat(3);}
function extracted(){return {product_name:'StoColor Dryonic',manufacturer:'Sto',application_temp_min_c:5,application_temp_max_c:30,drying_temp_min_c:5,drying_temp_max_c:30,recoat_hours_reference:24,rain_protection_hours:null,source_evidence:[{field:'application_temp_min_c',quote:'Working air and wall temperature +5 to +30 degrees C.'},{field:'application_temp_max_c',quote:'Working air and wall temperature +5 to +30 degrees C.'},{field:'drying_temp_min_c',quote:'Drying air temperature +5 to +30 degrees C.'},{field:'drying_temp_max_c',quote:'Drying air temperature +5 to +30 degrees C.'},{field:'recoat_hours_reference',quote:'Recoat after 24 hours at 20C and 65% humidity.'}],notes:[]};}
const search={sources:[{url:source,title:'StoColor Dryonic TDS'}]};
function weather(temp=7){
 const start=Date.parse('2026-11-05T00:00:00Z');
 return {timezone:'Europe/Berlin',location:'Berlin',fetchedAt:'2026-11-02T08:00:00Z',hours:Array.from({length:70},(_,i)=>({at:start+i*3600000,temp,precip:0,precipProbability:0,humidity:70,wind:2}))};
}
const deps={documentReader:async()=>({url:source,text:tds()}),extractor:async()=>extracted(),forecastReader:async()=>weather()};
test('same exact paint name is required to connect research and assessment',()=>{
 assert.equal(matchesResearchedProduct(query,'StoColor Dryonic'),true);
 assert.equal(matchesResearchedProduct(query,'StoColor Silco'),false);
 assert.equal(matchesResearchedProduct(query,'paint'),false);
});
test('official document and fresh forecast yield a conservative job-specific result',async()=>{
 const r=await checkResearchedPaint(search,query,job,deps);
 assert.equal(r.checked,true);assert.equal(r.check.product,'Sto StoColor Dryonic');assert.equal(r.check.status,'conditional');
 assert.equal(r.check.limits.applicationMin,5);assert.equal(r.check.limits.rainProtectionHours,null);
 assert.equal(r.check.workTempMin,7);assert.equal(r.check.source,source);assert.match(r.answer,/Weather check passed/);
 assert.ok(r.check.missing.some(x=>/wall|substrate/i.test(x)));
});
test('documented +5C limit versus 2C forecast becomes explicit not-recommended verdict',async()=>{
 const r=await checkResearchedPaint(search,query,job,{...deps,forecastReader:async()=>weather(2)});
 assert.equal(r.checked,true);assert.equal(r.check.status,'conflict');assert.match(r.check.reason,/below documented 5°C/);
});
test('wrong product on otherwise approved manufacturer domain is never checked',async()=>{
 const r=await checkResearchedPaint(search,query,job,{...deps,extractor:async()=>({...extracted(),product_name:'StoColor Silco'})});
 assert.equal(r.checked,false);assert.match(r.answer,/could not verify/i);
});
test('missing numeric application requirements means no invented job approval',async()=>{
 const r=await checkResearchedPaint(search,query,job,{...deps,extractor:async()=>({...extracted(),application_temp_min_c:null})});
 assert.equal(r.checked,false);assert.match(r.answer,/could not verify/i);
});
test('no source or no complete job returns actionable next steps',async()=>{
 assert.equal((await checkResearchedPaint({sources:[]},query,job,deps)).checked,false);
 assert.equal((await checkResearchedPaint(search,query,{},deps)).checked,false);
});
test('manufacturer PDF redirect to another domain is refused',async()=>{
 await assert.rejects(()=>retrieveManufacturerDocument(source,{fetcher:async()=>({status:302,headers:new Headers({location:'https://evil.com/data.pdf'})})}),/outside approved manufacturer/);
});
test('manufacturer HTML is fetched and readable but not treated as certified without AI extraction',async()=>{
 const body='<html><body><h1>StoColor Dryonic</h1><p>Working air temperature 5 degrees. Rain protection depends on drying. </p>'.repeat(4)+'</body></html>';
 const data=await retrieveManufacturerDocument('https://www.sto.de/stocolor-dryonic',{fetcher:async()=>new Response(body,{status:200,headers:{'content-type':'text/html'}})});
 assert.match(data.text,/StoColor Dryonic/);assert.match(data.text,/5 degrees/);
});

test('unknown drying limits remain unverified, never approved by web research',async()=>{
 const r=await checkResearchedPaint(search,query,job,{...deps,extractor:async()=>({...extracted(),drying_temp_min_c:null,drying_temp_max_c:null})});
 assert.equal(r.checked,true);assert.equal(r.status,'incomplete');assert.match(r.check.verdict,/Not enough data/i);
});

test('manufacturer document must itself contain the exact requested product name',async()=>{
 const r=await checkResearchedPaint(search,query,job,{...deps,documentReader:async()=>({url:source,text:'Technical information about a different coating with working temperature 5 to 30 degrees. '.repeat(4)})});
 assert.equal(r.checked,false);assert.match(r.answer,/could not verify/i);
});
test('rain during drying with unknown rainproof time is not labelled a clear window',async()=>{
 const wet=weather(9);wet.hours[15].precip=1.2;
 const r=await checkResearchedPaint(search,query,job,{...deps,forecastReader:async()=>wet});
 assert.equal(r.checked,true);assert.equal(r.status,'incomplete');assert.match(r.check.reason,/Rain is forecast during drying/i);
});

test('signed /api/chat performs manufacturer research + extraction + fresh weather automatically',async()=>{
 const {createServer}=await import('node:http');
 const originalFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY,oldEnv=process.env.NODE_ENV;
 process.env.OPENAI_API_KEY='mock-integration-key';process.env.NODE_ENV='test';
 const future=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
 const start=Math.floor(Date.now()/86400000)*86400;
 let extractedCalls=0,searchCalls=0,weatherCalls=0;
 const documentSource='https://www.sto.de/stocolor-dryonic-technical.html';
 const documentText=tds();
 globalThis.fetch=async(url,options={})=>{
  const href=String(url);
  if(href.includes('geocoding-api.open-meteo.com'))return new Response(JSON.stringify({results:[{name:'Berlin',admin1:'Berlin',country_code:'DE',latitude:52.52,longitude:13.405,timezone:'Europe/Berlin'}]}),{status:200,headers:{'content-type':'application/json'}});
  if(href.includes('api.open-meteo.com/v1/forecast')){
   weatherCalls++;
   const time=Array.from({length:384},(_,i)=>start+i*3600);
   return new Response(JSON.stringify({timezone:'Europe/Berlin',hourly:{time,temperature_2m:time.map(()=>3),relative_humidity_2m:time.map(()=>70),precipitation:time.map(()=>0),precipitation_probability:time.map(()=>10),wind_speed_10m:time.map(()=>4)}}),{status:200,headers:{'content-type':'application/json'}});
  }
  if(href.endsWith('/chat/completions')){
   const req=JSON.parse(options.body);
   if(req.response_format?.json_schema?.name==='technical_paint_extraction'){
    extractedCalls++;
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(extracted())}}]}),{status:200});
   }
   if(req.response_format?.json_schema?.name==='paint_explanation')return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({explanation:'There is a temperature conflict. Check the manufacturer datasheet and measure the wall before applying the paint.'})}}]}),{status:200});
   return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({answer:'I will research the official sheet.',action:'research_paint',paintId:null})}}]}),{status:200});
  }
  if(href.endsWith('/responses')){
   searchCalls++;
   const data={output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',text:'Official StoColor Dryonic technical data found.',annotations:[{type:'url_citation',url:documentSource,title:'StoColor Dryonic official TDS'}]}]}]};
   return new Response(JSON.stringify(data),{status:200});
  }
  if(href===documentSource)return new Response(`<html><body>${documentText}</body></html>`,{status:200,headers:{'content-type':'text/html'}});
  throw Error('Unexpected external request '+href);
 };
 let server;
 try{
  const {handler}=await import('../server.mjs');
  server=createServer(handler);await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=async(route,data)=>{
   const r=await originalFetch(base+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
   const value=await r.json();assert.equal(r.status,200,JSON.stringify(value));return value;
  };
  const result=await post('/api/check',{location:'Berlin',dateTime:future+'T10:00',durationHours:3,surface:'mineral_render',paintId:'muresko'});
  const ctx={job:result.job,forecast:{location:result.forecast.location,timezone:result.forecast.timezone,fetchedAt:result.forecast.fetchedAt},selected:{status:result.selected.status,paint:result.selected.paint,conflicts:result.selected.conflicts.slice(0,25),cautions:result.selected.cautions.slice(0,20),unknown:result.selected.unknown.slice(0,25),hours:result.selected.hours.slice(0,100)},alternatives:result.alternatives.map(x=>({paint:x.paint,reason:x.reason,conflicts:x.conflicts,unknown:x.unknown.slice(0,6)})),decision:result.decision};
  const response=await post('/api/chat',{question:query,result:ctx,reportSignature:result.contextSignature,history:[]});
  assert.equal(response.checked,true,JSON.stringify(response));assert.equal(response.check.status,'conflict');
  assert.equal(response.check.product,'Sto StoColor Dryonic');assert.equal(response.check.limits.applicationMin,5);
  assert.equal(response.check.source,documentSource);
  assert.equal(searchCalls,1);assert.equal(extractedCalls,1);assert.equal(weatherCalls,2);
 }finally{
  globalThis.fetch=originalFetch;
  if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;
  if(oldEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldEnv;
  if(server)await new Promise(done=>server.close(done));
 }
});
