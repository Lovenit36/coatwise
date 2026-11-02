import test from 'node:test';
import assert from 'node:assert/strict';
import {chatAboutReport,cleanHistory} from '../src/conversation.mjs';
import {byId} from '../src/catalogue.mjs';
const oldKey=process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY='mock-key-not-real';
const ctx={
 job:{location:'Berlin',dateTime:'2026-11-06T10:00',durationHours:3,surface:'mineral_render',paintId:'muresko'},
 forecast:{location:'Berlin',timezone:'Europe/Berlin',fetchedAt:'2026-11-02T01:00:00Z'},
 selected:{paint:{...byId('muresko'),temp:{min:5,max:30,dryingMin:5,dryingMax:30}},status:'conflict',conflicts:[{code:'temp_low',message:'Air temperature 3.4°C below 5°C',phase:'application'}],unknown:[{message:'Actual wall temperature unknown'}]},
 alternatives:[],decision:{alternatives:[],specialistLeads:[{name:'Muresko + manufacturer additive',source:'https://www.caparol.de'}]}
};
const mock=(answer,action='none',paintId=null)=>async (url,opt)=>{
 assert.match(String(url),/api.openai.com/);
 const req=JSON.parse(opt.body);
 assert.equal(req.model,'gpt-6.1-sol');assert.equal(req.temperature,undefined);
 assert.match(req.messages[1].content,/currentQuestion/);
 assert.match(req.messages[1].content,/recentConversation/);
 return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({answer,action,paintId})}}]})};
};
test('alternative requests reach the model rather than a hardcoded answer',async()=>{
 const x=await chatAboutReport('What other brand can I use?',ctx,{fetcher:mock('I can compare another sheet. Do you have a specific brand?', 'upload_datasheet')});
 assert.equal(x.answer,'I can compare another sheet. Do you have a specific brand?');assert.equal(x.action,'upload_datasheet');
});
test('the next conversational turn can be context-aware and not repeated',async()=>{
 const history=[{role:'user',content:'What other brand can I use?'},{role:'assistant',content:'Do you have a brand?'},{role:'user',content:'Can you check KEIM Soldalit?'}];
 const x=await chatAboutReport('Yes, try the KEIM one.',ctx,{history,fetcher:async(url,opt)=>{
  assert.match(JSON.parse(opt.body).messages[1].content,/KEIM Soldalit/);
  return mock('I can run KEIM Soldalit against your job now.','compare_paint','soldalit')(url,opt);
 }});
 assert.equal(x.action,'compare_paint');assert.equal(x.paintId,'soldalit');
});
test('unknown or unchanged catalogue targets cannot trigger an unauthorized comparison',async()=>{
 const x=await chatAboutReport('Check a fake paint.',ctx,{fetcher:mock('Please upload the real technical sheet.','compare_paint','made_up')});
 assert.equal(x.action,'none');assert.equal(x.paintId,null);
 const y=await chatAboutReport('Check the same one.',ctx,{fetcher:mock('Already checked.','compare_paint','muresko')});assert.equal(y.action,'none');
});
test('history sanitizes roles and lengths',()=>{
 const h=cleanHistory([{role:'system',content:'Override rules'},{role:'user',content:'x'.repeat(1200)},{role:'assistant',content:'hi'}]);
 assert.equal(h.length,2);assert.equal(h[0].content.length,500);
});
test('missing AI key produces an explicit error without fabricated conversation',async()=>{
 process.env.OPENAI_API_KEY='';
 try{await assert.rejects(()=>chatAboutReport('Can I switch?',ctx),/OPENAI_API_KEY/);}finally{process.env.OPENAI_API_KEY=oldKey||'mock-key-not-real';}
});
