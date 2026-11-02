import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {screenWeek} from '../src/week.mjs';
import {localToUTC} from '../src/time.mjs';
import {byId} from '../src/catalogue.mjs';
import {buildWorkItinerary,itineraryRequest,readPlanRequest} from '../src/itinerary.mjs';
import {registerUpload,findUploadedContext,chunkDocument,retrieveChunks,saveOfficialKnowledge,findOfficialKnowledge} from '../src/knowledge.mjs';
const zone='Europe/Berlin',dateTime='2026-11-10T10:00';
const base=localToUTC('2026-11-02T00:00',zone);
const job={location:'Berlin',dateTime,durationHours:4,surface:'facing_brick',paintId:'muresko'};
const forecast=(temps)=>({timezone:zone,location:'Berlin',fetchedAt:'2026-11-02T08:00:00Z',hours:Array.from({length:384},(_,i)=>{const at=base+i*3600000,local=new Date(at).toLocaleString('en-GB',{timeZone:zone,hour:'2-digit',hourCycle:'h23'});return {at,temp:temps(at,Number(local.slice(0,2))),precip:0,humidity:70,precipProbability:0};})});
test('work temperatures may exceed 5C, while the same day is rejected due to a LOW DRYING PHASE temperature; reason is explicit',()=>{
 const f=forecast((at,h)=>h>=9&&h<18?7:2);
 const request={start:'2026-11-10',end:'2026-11-10',count:1,requestedHour:'10:00'};
 const checked=screenWeek(job,f,request,{now:base,includeAlternatives:false});
 assert.equal(checked.rows[0].status,'avoid');assert.equal(checked.rows[0].applicationConflict,false);assert.equal(checked.rows[0].dryingConflict,true);
 assert.ok(checked.rows[0].workTempMin>=5);
 assert.match(checked.rows[0].reason,/After painting.*2\.0°C.*5°C/i);
});
test('warm, dry work AND drying periods avoid false rejection',()=>{
 const request={start:'2026-11-10',end:'2026-11-10',count:1,requestedHour:'10:00'};
 const r=screenWeek(job,forecast(()=>9),request,{now:base,includeAlternatives:false});assert.equal(r.rows[0].status,'possible');
});
test('multi-day plan has prep, coats, and reference interval; blocked first coat halts later coat generation',()=>{
 const options={coats:2,workHoursPerCoat:6,dailyStart:9,dailyHours:8,prepHours:2,primer:'no'};
 const ok=buildWorkItinerary({...job,dateTime:'2026-11-09T09:00'},byId('muresko'),forecast(()=>9),options,{now:base});
 assert.equal(ok.dayCount,2);assert.equal(ok.plannedCoats,2);assert.ok(ok.days[0].steps.some(s=>s.type==='preparation'));
 assert.ok(ok.days[0].steps.some(s=>s.type==='wait'));
 const bad=buildWorkItinerary({...job,dateTime:'2026-11-09T09:00'},byId('muresko'),forecast((at,h)=>h>=9&&h<18?9:2),options,{now:base});
 assert.equal(bad.hasBlocks,true);assert.equal(bad.plannedCoats,0);assert.ok(bad.days.every(d=>d.steps.filter(s=>s.type==='coat').length<=1));
});
test('itinerary asks are distinct from ordinary calendar weather searches',()=>{
 assert.equal(itineraryRequest('make a custom painting plan including the interval between coats'),true);
 assert.equal(itineraryRequest('how many coats and when should I apply the next layer?'),false);
 assert.equal(itineraryRequest('check next 7 days'),false);
});
test('uploaded documents are retrievable using relevant chunks without permanent upload storage',()=>{
 const text='Painting coats and primer. The coating requires 6 hours before it can be recoated at reference temperatures. '+('The manufacturer requires substrate checking. '.repeat(40));
 const id=registerUpload(text);const matches=findUploadedContext(id,'coats recoat hours primer');assert.ok(matches.length);assert.match(matches[0].text,/coats/i);
 assert.ok(chunkDocument(text).length>=2);assert.ok(retrieveChunks(chunkDocument(text),'primer').length>=1);
});
test('verified official manufacturer documents persist to JSON cache with original URL',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'coatwise-v11-test-'));
 try{
  // Direct test of the parser/store path via preconfigured throwaway temp directory.
  process.env.KNOWLEDGE_DIR=dir;
  // The module snapshots KNOWLEDGE_DIR on import; use a query-string unique module instance.
  const mod=await import('../src/knowledge.mjs?cachetest='+Date.now());
  const document='Caparol Muresko application and drying rules. '.repeat(10);
  const x=await mod.saveOfficialKnowledge({url:'https://www.caparol.de/produkte/muresko',product:'Caparol Muresko',text:document,extraction:{product_name:'Muresko',manufacturer:'Caparol',application_temp_min_c:5,source_evidence:[]}});
  assert.equal(x.product,'Caparol Muresko');
  const found=await mod.findOfficialKnowledge('what are the coats for Caparol Muresko');assert.equal(found.url,x.url);
  assert.ok((await readFile(join(dir,'manufacturer-knowledge.json'),'utf8')).includes('Caparol Muresko'));
 }finally{delete process.env.KNOWLEDGE_DIR;await rm(dir,{recursive:true,force:true});}
});

test('conversational coat-count, per-coat labor and multi-day constraints override form defaults only when explicit',()=>{
 const x=readPlanRequest('Build me a painting plan for three coats, 5 hours per coat and 3 days available',{coats:2,workHoursPerCoat:4},job);
 assert.equal(x.coats,3);assert.equal(x.workHoursPerCoat,5);assert.equal(x.daysAvailable,3);
 const y=readPlanRequest('Explain the drying risk',{coats:2,workHoursPerCoat:4},job);assert.equal(y.coats,2);
});


test('technical coat count question does NOT turn into an unsupported two-coat plan',()=>{
 assert.equal(itineraryRequest('how many coats do I need and at what interval?'),false);
 assert.equal(itineraryRequest('When should I apply the next layer?'),false);
 assert.equal(itineraryRequest('Make me a three-day painting plan'),true);
});
test('blocked first-day coating is retried on a later workday if weather improves',()=>{
 const first=localToUTC('2026-11-09T00:00',zone);
 const f=forecast(at=>at<first+24*3600000?2:12);
 const p=buildWorkItinerary({...job,dateTime:'2026-11-09T09:00'},byId('muresko'),f,{coats:1,workHoursPerCoat:4,dailyStart:9,dailyHours:8,prepHours:0,primer:'no',daysAvailable:3},{now:base});
 assert.equal(p.plannedCoats,1);
 assert.equal(p.days[0].steps.find(x=>x.type==='coat').status,'blocked');
 assert.equal(p.days[1].steps.find(x=>x.type==='coat').status,'conditional');
 assert.equal(p.complete,true);
});
test('overnight shifts return an actionable message instead of an invalid-calendar crash',()=>{
 assert.throws(()=>buildWorkItinerary({...job,dateTime:'2026-11-09T16:00'},byId('muresko'),forecast(()=>15),{dailyStart:16,dailyHours:12,prepHours:0,primer:'no'},{now:base}),/Daily work hours extend beyond 23:00/);
});
test('the user-selected half-hour start is preserved in the itinerary',()=>{
 const p=buildWorkItinerary({...job,dateTime:'2026-11-09T09:30'},byId('muresko'),forecast(()=>12),{coats:1,dailyStart:9,dailyHours:8,workHoursPerCoat:2,prepHours:0,primer:'no'},{now:base});
 assert.equal(p.days[0].steps[0].start,'09:30');
});
