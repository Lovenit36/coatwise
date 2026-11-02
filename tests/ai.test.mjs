import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pdfToText} from '../src/pdf-text.mjs';
import {extractWithAI,explainWithAI} from '../src/ai.mjs';
import {evaluateJob} from '../src/engine.mjs';
const file=new URL('./fixtures/sample-extractable.pdf',import.meta.url);
test('text-based PDF is truly extracted via Poppler, rather than accepted as empty or fake text',async t=>{
 const data=await readFile(file);if(!process.env.CI_POPPLER_REQUIRED){const {spawnSync}=await import('node:child_process');if(spawnSync('which',['pdftotext']).status!==0)return t.skip('pdftotext unavailable on host');}
 const txt=await pdfToText(data);
 assert.match(txt,/TEST FIXTURE ONLY/);assert.match(txt,/application air temperature minimum \+5 C/);assert.match(txt,/12 hours/);
});
test('binary fake PDF is rejected',async()=>{await assert.rejects(pdfToText(Buffer.from('not a pdf!')),/not a valid PDF/)});
test('mocked OpenAI structured extraction has quotes and source-backed schema',async()=>{
 const txt='Official test: Application temperature at least +5 °C. Do not apply in strong sun. Processing and drying precautions. '.repeat(5);
 const modelOutput={product_name:'Test Coat',manufacturer:'Test Manufacturer',application_temp_min_c:5,application_temp_max_c:null,drying_temp_min_c:null,drying_temp_max_c:null,rain_protection_hours:null,recoat_hours_reference:null,source_evidence:[{field:'application_temp_min_c',quote:'Application temperature at least +5 °C'}],notes:'Some conditions unspecified.'};
 process.env.OPENAI_API_KEY='a-test-only-key';
 try{
  const result=await extractWithAI(txt,{fetcher:async (url,options)=>{
   assert.match(url,/openai.com/);assert.equal(options.headers.Authorization,'Bearer a-test-only-key');
   const b=JSON.parse(options.body);assert.equal(b.response_format.type,'json_schema');assert.equal(b.response_format.json_schema.strict,true);
   return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(modelOutput)}}]})};
  }});
  assert.equal(result.application_temp_min_c,5);assert.equal(result.application_temp_max_c,null);assert.ok(result.source_evidence.length===1);
 }finally{delete process.env.OPENAI_API_KEY;}
});
test('mocked AI explanation uses only checked data; invented numbers trigger automatic rejection',async()=>{
 const now=Date.parse('2026-11-02T08:00:00Z');const H=3600000;
 const f={location:'Berlin, Germany',timezone:'Europe/Berlin',fetchedAt:new Date().toISOString(),hours:Array.from({length:80},(_,i)=>({at:now+i*H,temp:6,humidity:65,precip:0,wind:5}))};
 const r=evaluateJob({paintId:'sylitol',dateTime:'2026-11-02T09:00',durationHours:4,surface:'mineral_render'},f);
 process.env.OPENAI_API_KEY='a-test-only-key';
 try{
 const good=await explainWithAI(r,{fetcher:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({explanation:'The forecast conflicts with the selected paint requirements. Measure wall temperature and consult the technical sheet before proceeding.'})}}]})})});
 assert.equal(good.status,'ok');
 const bad=await explainWithAI(r,{fetcher:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({explanation:'The paint is perfectly safe at exactly 9999 degrees, guaranteed.'})}}]})})});
 assert.equal(bad.status,'unsupported_numbers');assert.equal(bad.summary,null);
 }finally{delete process.env.OPENAI_API_KEY;}
});
