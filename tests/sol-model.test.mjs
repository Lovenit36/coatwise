import test from 'node:test';
import assert from 'node:assert/strict';
import {extractWithAI} from '../src/ai.mjs';
import {parseJobWithAI} from '../src/conversation.mjs';

test('Sol: extraction request has a supported model and no temperature',async()=>{
 const oldKey=process.env.OPENAI_API_KEY,oldModel=process.env.OPENAI_MODEL;
 process.env.OPENAI_API_KEY='test-key';process.env.OPENAI_MODEL='gpt-6.1-sol';
 const doc='Application temperature minimum 5 degrees Celsius. '.repeat(5);
 try {
  await extractWithAI(doc,{fetcher:async(_url,opts)=>{
   const body=JSON.parse(opts.body);
   assert.equal(body.model,'gpt-6.1-sol');assert.equal(body.reasoning_effort,'low');
   assert.equal(Object.hasOwn(body,'temperature'),false);
   assert.equal(body.response_format.type,'json_schema');
   return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({product_name:'Test',manufacturer:'Maker',application_temp_min_c:5,application_temp_max_c:null,drying_temp_min_c:null,drying_temp_max_c:null,rain_protection_hours:null,recoat_hours_reference:null,source_evidence:[{field:'application_temp_min_c',quote:'Application temperature minimum 5 degrees Celsius'}],notes:''})}}]})};
  }});
 } finally {if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;
   if(oldModel===undefined)delete process.env.OPENAI_MODEL;else process.env.OPENAI_MODEL=oldModel;}
});

test('Sol: conversational request omits unsupported temperature',async()=>{
 const oldKey=process.env.OPENAI_API_KEY,oldModel=process.env.OPENAI_MODEL;
 process.env.OPENAI_API_KEY='test-key';process.env.OPENAI_MODEL='gpt-6.1-sol';
 try {
  const result=await parseJobWithAI('I need to paint a wall',{fetcher:async(_url,opts)=>{
   const body=JSON.parse(opts.body);
   assert.equal(body.model,'gpt-6.1-sol');assert.equal(body.reasoning_effort,'low');
   assert.equal(Object.hasOwn(body,'temperature'),false);assert.equal(body.response_format.type,'json_object');
   return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({fields:{location:null,dateTime:null,durationHours:null,surface:null,paintId:null},note:'Please complete the form.'})}}]})};
  }});
  assert.equal(result.fields.location,null);
 } finally {if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;
   if(oldModel===undefined)delete process.env.OPENAI_MODEL;else process.env.OPENAI_MODEL=oldModel;}
});
