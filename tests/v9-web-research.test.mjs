import test from 'node:test';
import assert from 'node:assert/strict';
import {officialManufacturerUrl,interpretWebSearchResult,researchPaintOnline} from '../src/web-research.mjs';
import {chatAboutReport} from '../src/conversation.mjs';
const sample={output:[{type:'web_search_call',status:'completed',action:{type:'search',queries:['StoColor Dryonic official datasheet']}},{type:'message',content:[{type:'output_text',text:'StoColor Dryonic has manufacturer specifications to review.',annotations:[{type:'url_citation',url:'https://www.sto.de/some-technical-information',title:'Sto technical sheet'},{type:'url_citation',url:'http://127.0.0.1/secret',title:'Bad'},{type:'url_citation',url:'https://example.com/copies',title:'Not official'}]}]}]};
const ctx={job:{paintId:'muresko',location:'Berlin',dateTime:'2026-11-05T10:00',surface:'mineral_render',durationHours:4},forecast:{location:'Berlin',fetchedAt:'2026-11-02T10:00:00Z'},selected:{paint:{id:'muresko',name:'Muresko',brand:'Caparol'},status:'conflict',conflicts:[],unknown:[]},alternatives:[]};
const oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='unit-test-key';
test('manufacturer citation domains are restricted, and no URLs can resolve to localhost',()=>{
 assert.equal(officialManufacturerUrl('https://www.sto.de/info'),true);
 for(const url of ['http://www.sto.de/','https://sto.de.evil.example/path','https://localhost/','https://user:pass@sto.de/a','https://127.0.0.1/test'])assert.equal(officialManufacturerUrl(url),false,url);
});
test('web citation extraction keeps only manufacturer cited URLs',()=>{
 const found=interpretWebSearchResult(sample);assert.equal(found.researched,true);assert.equal(found.action,'upload_datasheet');assert.equal(found.sources.length,1);assert.match(found.sources[0].url,/sto\.de/);
});
test('no actual web call is never reported as searched',()=>{
 assert.equal(interpretWebSearchResult({output:sample.output.slice(1)}).researched,false);
 assert.equal(interpretWebSearchResult({output:[sample.output[0]]}).sources.length,0);
});
test('Responses request uses GPT-6.1 Sol web_search and server key, no third-party search key',async()=>{
 const result=await researchPaintOnline('Find the official StoColor Dryonic sheet',{}, {fetcher:async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');assert.match(options.headers.Authorization,/unit-test-key/);
  const request=JSON.parse(options.body);assert.equal(request.model,'gpt-6.1-sol');assert.deepEqual(request.tools[0].type,'web_search');assert.equal(request.tool_choice,'required');
  return {ok:true,json:async()=>sample};
 }});assert.equal(result.sources.length,1);
});
test('a missing manufacturer citation means no unsupported claims are shown',()=>{
 const response=interpretWebSearchResult({output:[sample.output[0],{type:'message',content:[{type:'output_text',text:'It is safe for -50 degrees',annotations:[{type:'url_citation',url:'https://shop.example.com/unknown',title:'shop'}]}]}]});
 assert.doesNotMatch(response.answer,/safe for/i);assert.match(response.answer,/could not confirm/i);
});
test('unknown-product chat action triggers web search instead of requesting upload only',async()=>{
 let researched=false;
 const result=await chatAboutReport('Find official StoColor Dryonic requirements',ctx,{fetcher:async(url,opt)=>{
  if(url.includes('chat/completions'))return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({answer:'I can look for a manufacturer sheet.',action:'research_paint',paintId:null})}}]})};
  if(url.includes('/responses')){researched=true;return {ok:true,json:async()=>sample};}
  throw Error('wrong route');
 }});
 assert.equal(researched,true);assert.equal(result.researched,true);assert.equal(result.sources.length,1);
});
test('OpenAI web-search provider errors are handled without manufacturing facts',async()=>{
 await assert.rejects(()=>researchPaintOnline('Look up a manufacturer paint',{}, {fetcher:async()=>({ok:false,status:429,json:async()=>({error:{message:'Rate limited'}})})}),/HTTP 429/);
});
test.after(()=>{if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;});
test('the new HTTP research route returns manufacturer references without requiring a previous job',async()=>{
 const {createServer}=await import('node:http');
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{
  if(String(url).startsWith('https://api.openai.com/v1/responses'))return {ok:true,json:async()=>sample};
  return originalFetch(url,opts);
 };
 let server;
 try {
  const previousNodeEnv=process.env.NODE_ENV;process.env.NODE_ENV='test';
  const {handler}=await import('../server.mjs');
  if(previousNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousNodeEnv;
  server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/api/research-paint`;
  const r=await originalFetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:'Search StoColor Dryonic manufacturer technical requirements'})});
  assert.equal(r.status,200);const data=await r.json();assert.equal(data.researched,true);assert.equal(data.sources[0].title,'Sto technical sheet');
 } finally {globalThis.fetch=originalFetch;if(server)await new Promise(resolve=>server.close(resolve));}
});
