import http from 'node:http';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
import {catalogue,surfaces,byId} from './src/catalogue.mjs';
import {getForecast} from './src/weather.mjs';
import {evaluateJob} from './src/engine.mjs';
import {decideNext} from './src/plan.mjs';
import {scheduleRequest,monthRequest,screenWeek} from './src/week.mjs';
import {localToUTC} from './src/time.mjs';
import {extractWithAI,approvedUploadToPaint,explainWithAI} from './src/ai.mjs';
import {pdfToText} from './src/pdf-text.mjs';
import {writeEvent,eventStats} from './src/events.mjs';
import {chatAboutReport,parseJobWithAI,respondToIntake} from './src/conversation.mjs';
import {researchPaintOnline,officialManufacturerUrl} from './src/web-research.mjs';
import {checkResearchedPaint,retrieveManufacturerDocument} from './src/researched-check.mjs';
import {registerUpload,findUploadedContext,retrieveOfficialContext,saveOfficialKnowledge,findOfficialKnowledge,retrieveChunks} from './src/knowledge.mjs';
import {buildWorkItinerary,itineraryRequest,readPlanRequest} from './src/itinerary.mjs';
import {requestedPlanPaint,planReply,hasWallDimensions} from './src/plan-response.mjs';
const SIGNING_KEY=process.env.SIGNING_SECRET||randomBytes(32).toString('hex');
const sign=(v)=>createHmac('sha256',SIGNING_KEY).update(JSON.stringify(v)).digest('hex');
const validSignature=(v,s)=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s)&&timingSafeEqual(Buffer.from(sign(v),'hex'),Buffer.from(s,'hex'));
function compactContext(r){return {job:r.job??null,forecast:{location:r.forecast.location,timezone:r.forecast.timezone,fetchedAt:r.forecast.fetchedAt},selected:{status:r.selected.status,paint:r.selected.paint,conflicts:r.selected.conflicts.slice(0,25),cautions:r.selected.cautions.slice(0,20),unknown:r.selected.unknown.slice(0,25),hours:r.selected.hours.slice(0,100)},alternatives:r.alternatives.map(x=>({paint:x.paint,reason:x.reason,conflicts:x.conflicts,unknown:x.unknown.slice(0,6)})),decision:r.decision};}
async function ensureOfficialEvidence(paint,question){
 if(!paint?.source)return null;
 let known=await retrieveOfficialContext(`${paint.brand} ${paint.name} ${question}`);
 if(known)return known;
 if(!officialManufacturerUrl(paint.source))return null;
 try{
  const src=await retrieveManufacturerDocument(paint.source);
  const p=byId(paint.id);
  if(!p)return null;
  await saveOfficialKnowledge({url:src.url,product:`${p.brand} ${p.name}`,extraction:{product_name:p.name,manufacturer:p.brand,application_temp_min_c:p.min,application_temp_max_c:p.max,drying_temp_min_c:p.dryingMin,drying_temp_max_c:p.dryingMax,recoat_hours_reference:p.recoatHours,rain_protection_hours:p.rainProtectionHours,source_evidence:[]},text:src.text});
  return {product:`${p.brand} ${p.name}`,url:src.url,chunks:retrieveChunks([src.text.slice(0,20000)],question)};
 }catch{return null;}
}
function monthAnswer(result){
 const summary=`I checked ${result.checkedCount} future ${result.checkedCount===1?'day':'days'} in ${result.monthLabel} against ${result.paint}'s documented weather limits.`;
 const dates=(result.bestDates||[]).slice(0,3).map(d=>`${d.label} at ${d.dateTime.slice(11,16)} (${d.workTempMin.toFixed(1)}–${d.workTempMax.toFixed(1)}°C during work)`);
 const best=dates.length?`Best forecast ${dates.length===1?'option':'options'}: ${dates.join('; ')}. These are weather candidates, not final approval to paint.`:result.checkedCount?`None of the checked dates passed the temperature and rain screening for this paint.`:`No dates in this month are covered well enough to judge yet.`;
 const out=result.unavailableCount?` ${result.unavailableCount} later ${result.unavailableCount===1?'day is':'days are'} beyond the available forecast, so I cannot judge those yet.`:'';
 const leads=(result.productLeads||[]).slice(0,2);const suggestion=leads.length?` Other manufacturer-documented cold-weather paint leads: ${leads.map(p=>`${p.name} (${p.min}°C application minimum; showerproof ~${p.showerproofMinutes} min)`).join('; ')}. These are NOT approved for your wall or drying conditions; check the original sheets and availability in Germany.`:'';return `${summary} ${best}${out}${suggestion}`;
}
const ROOT=resolve('public'), PORT=Number(process.env.PORT)||3000;
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon'};
const limits=new Map();
const reply=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};
const security={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'self'; form-action 'self'"};
function limited(ip){const now=Date.now(),entry=limits.get(ip)||{ts:now,count:0};if(now-entry.ts>60000){entry.ts=now;entry.count=0;}entry.count++;limits.set(ip,entry);if(limits.size>2000){for(const [k,v] of limits)if(now-v.ts>60000)limits.delete(k);}return entry.count>40;}
function body(req){return new Promise((resolve,reject)=>{let s='',bytes=0;req.on('data',x=>{bytes+=x.length;if(bytes>2400000){reject(Object.assign(new Error('Request exceeds 2.4 MB.'),{status:413}));req.destroy();return;}s+=x.toString();});req.on('end',()=>{try{resolve(JSON.parse(s||'{}'))}catch{reject(new Error('Invalid JSON body.'))}});req.on('error',reject);});}
const handler=async(req,res)=>{
 Object.entries(security).forEach(([k,v])=>res.setHeader(k,v));
 const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
 const method=req.method||'GET';
 try{
  if(url.pathname==='/api/health')return reply(res,200,{status:'ok',version:'2.1.0',aiReady:!!process.env.OPENAI_API_KEY,weatherProvider:'Open-Meteo; live external requests only',weatherMode:process.env.WEATHER_API_KEY?'commercial':'evaluation',catalogueCount:catalogue.length});
  if(url.pathname==='/api/catalogue'&&method==='GET')return reply(res,200,{paints:catalogue,surfaces});
  if(url.pathname==='/api/stats'&&method==='GET'){
    if(!process.env.ADMIN_TOKEN||req.headers.authorization!==`Bearer ${process.env.ADMIN_TOKEN}`)return reply(res,401,{error:'Admin token required.'});
    return reply(res,200,await eventStats());
  }
  if(method==='POST'&&url.pathname.startsWith('/api/')){
   const host=String(req.headers.host||'');const origin=req.headers.origin;
   if(origin&&new URL(origin).host!==host)return reply(res,403,{error:'Cross-origin request blocked.'});
   const ip=req.socket.remoteAddress||'unknown';if(limited(ip))return reply(res,429,{error:'Too many requests. Please retry later.'});
   const input=await body(req);
   if(url.pathname==='/api/events'){await writeEvent(input);return reply(res,201,{ok:true});}
   if(url.pathname==='/api/extract'){
    let text=input.text;
    if(input.fileBase64){
      if(typeof input.fileBase64!=='string'||input.fileBase64.length>2100000)throw new Error('Uploaded PDF is too large.');
      const bytes=Buffer.from(input.fileBase64,'base64');text=await pdfToText(bytes);
    }
    const extraction=await extractWithAI(text);
    const approvalToken=Buffer.from(JSON.stringify({extraction,expires:Date.now()+3600000})).toString('base64url');
    const documentId=registerUpload(text);
    return reply(res,200,{extraction,documentId,approvalToken:approvalToken+'.'+sign(approvalToken)});
   }
   if(url.pathname==='/api/research-paint'){
    if(typeof input.question!=='string'||input.question.trim().length<3||input.question.length>700)throw new Error('Enter a paint name or a manufacturer research question.');
    return reply(res,200,await researchPaintOnline(input.question,{history:input.history}));
   }
   if(url.pathname==='/api/intake'){
    if(typeof input.question!=='string'||input.question.trim().length<2||input.question.length>2000)throw new Error('Please send a shorter message.');
    return reply(res,200,await respondToIntake(input.question,{history:input.history,documentContext:findUploadedContext(input.documentId,input.question)}));
   }
   if(url.pathname==='/api/parse-job'){
    if(typeof input.question!=='string'||input.question.length>1000)throw new Error('Please enter a shorter job description.');
    return reply(res,200,await parseJobWithAI(input.question));
   }
   if(url.pathname==='/api/chat'){
    if(typeof input.question!=='string'||input.question.trim().length<3||input.question.length>700)throw new Error('Enter a question under 700 characters.');
    if(!input.result||!validSignature(input.result,input.reportSignature))return reply(res,403,{error:'This assessment is not verified by the server. Run a new live assessment.'});
    // Plan requests use a fresh forecast and the product explicitly selected in chat.
    // Keep the reply short; never let a model rewrite or approve blocked weather.
    const baseJob=input.result.job||{};
    const carryPaint=input.planPaintId&&validSignature({paintId:input.planPaintId,job:baseJob},input.planPaintProof)?byId(input.planPaintId):null;
    if(itineraryRequest(input.question)||(carryPaint&&hasWallDimensions(input.question))){
     const switched=requestedPlanPaint(input.question,baseJob.paintId);
     const chosen=switched||carryPaint;
     const job=chosen?{...baseJob,paintId:chosen.id}:baseJob;
     const paint=chosen||(job.paintId==='uploaded'?job.uploadedPaint:byId(job.paintId));
     if(!paint)return reply(res,409,{error:'Select a specific paint and run a live job check before planning.'});
     const options=readPlanRequest(input.question,input.planOptions||{},job);
     const live=await getForecast(job.location);
     const itinerary=buildWorkItinerary(job,paint,live,options);
     const start=job.dateTime.slice(0,10);
     const lastDay=new Date(Date.parse(start+'T12:00:00Z')+(Math.min(options.daysAvailable||7,15)-1)*86400000).toISOString().slice(0,10);
     const weather=screenWeek(job,live,{kind:'week',start,end:lastDay,count:Math.min(options.daysAvailable||7,15),requestedHour:job.dateTime.slice(11,16)},{includeAlternatives:false});
     return reply(res,200,{answer:planReply(itinerary,paint),itinerary,planWeather:weather,planWeatherSignature:sign(weather),planPaintId:paint.id,planPaintProof:sign({paintId:paint.id,job:baseJob})});
    }
    const signedWeek= input.weekContext&&validSignature(input.weekContext,input.weekSignature)?input.weekContext:null;
    const month=monthRequest(input.question,input.result.job||{});
    if(month){
     if(!input.result.job?.location||!input.result.job?.dateTime||!input.result.job?.paintId)return reply(res,409,{error:'Saved report has no job details. Run a new assessment to enable month checks.'});
     const live=await getForecast(input.result.job.location);
     const period=screenWeek(input.result.job,live,month);
     return reply(res,200,{answer:monthAnswer(period),period,periodSignature:sign(period)});
    }
    const schedule=scheduleRequest(input.question,input.result.job||{});
    if(schedule){
     if(!input.result.job?.location||!input.result.job?.dateTime||!input.result.job?.paintId)return reply(res,409,{error:'This is an older saved report. Click Check paint & weather once to enable live seven-day checking.'});
     const live=await getForecast(input.result.job.location);
     // If the question explicitly names another known paint, compare THAT paint instead of silently reusing the previous report.
     const named=catalogue.filter(p=>p.id!==input.result.job.paintId&&new RegExp('\\b'+p.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(input.question));
     const requested= named.length===1?named[0]:null;
     const week=screenWeek({...input.result.job,...(requested?{paintId:requested.id}:{})},live,schedule);
     if(requested)week.activePaintId=requested.id;
     const extras=week.alternatives?.length?` Other manufacturer-documented paint candidates: ${week.alternatives.map(a=>a.name).join(', ')}.`:week.productLeads?.length?` Cold-weather paint leads: ${week.productLeads.map(p=>`${p.name} (down to ${p.min}°C for application)`).join('; ')}. Check drying, wall and availability before switching.`:week.winterOption?' Caparol also documents a Muresko cold-weather additive; see its requirements below.':'';
     return reply(res,200,{weekSignature:sign(week),answer:(week.possibleCount?`${week.title}. Select a possible day to recheck it.`:`${week.title} (${week.start} to ${week.end}).`)+extras,week});
    }
    let docContext=findUploadedContext(input.documentId,input.question),officialKnowledge=null;
    const knownPaint=input.result?.selected?.paint;
    const technicalQuestion=/\b(coat|layer|primer|dilut|mix|applicat|method|interval|dry|drying|datasheet|document|techni|manufacturer|prepar|untergrund|anstrich)\b/i.test(input.question);
    if(technicalQuestion&&knownPaint?.source){
      officialKnowledge=await ensureOfficialEvidence(knownPaint,input.question);
    }
    const conversation=await chatAboutReport(input.question,input.result,{history:input.history,documentContext:docContext,officialKnowledge,week:signedWeek});
    if(conversation.researched){
     const checked=await checkResearchedPaint(conversation,input.question,input.result.job);
     return reply(res,200,{...conversation,...checked,answer:checked.answer,action:checked.checked?'none':'upload_datasheet'});
    }
    return reply(res,200,conversation);
   }
   if(url.pathname==='/api/check'){
    if(!input||typeof input!=='object'||typeof input.paintId!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(input.dateTime||'')||!surfaces[input.surface])throw new Error('Complete all required job fields.');
    if(input.paintId==='uploaded'){
     if(typeof input.approvalToken!=='string'||input.approvalToken.length>16000)throw new Error('Missing approved datasheet extraction.');
     const chunks=input.approvalToken.split('.');
     if(chunks.length!==2||!validSignature(chunks[0],chunks[1]))throw new Error('Datasheet validation has expired or failed. Re-extract the file.');
     const claim=JSON.parse(Buffer.from(chunks[0],'base64url').toString());
     if(!claim.extraction||claim.expires<Date.now())throw new Error('Datasheet approval expired. Re-extract the manufacturer file.');
     input.uploadedPaint=approvedUploadToPaint({...claim.extraction,userApproved:true});
    }
    else if(!byId(input.paintId))throw new Error('Choose a listed paint product.');
    const forecast=await getForecast(input.location);
    const starts=localToUTC(input.dateTime,forecast.timezone), now=Date.now();
    if(starts<now-600000)throw new Error('Select a future job start time.');
    const chosen=input.paintId==='uploaded'?input.uploadedPaint:byId(input.paintId);
    const hoursNeeded=Number(input.durationHours)+Math.max(chosen.referenceHours??chosen.recoatHours??0,chosen.rainProtectionHours??0);
    const lastHour=forecast.hours.at(-1)?.at;
    if(!lastHour||starts+hoursNeeded*3600000>lastHour+3600000)throw new Error('Selected job and drying screening period extend beyond the available 16-day forecast. Choose an earlier date.');
    const result=evaluateJob(input,forecast);
    result.job={location:input.location,dateTime:input.dateTime,durationHours:Number(input.durationHours),surface:input.surface,paintId:input.paintId,...(input.paintId==='uploaded'?{uploadedPaint:input.uploadedPaint}:{})};
    if(!result.selected.coverageComplete)result.incompleteNotice='Forecast does not cover the full requested inspection window. No approval may be inferred.';
    result.decision=decideNext(input,result,forecast);
    result.ai=await explainWithAI(result);
    result.contextSignature=sign(compactContext(result));
    return reply(res,200,result);
   }
   return reply(res,404,{error:'Unknown API endpoint.'});
  }
  if(method!=='GET'&&method!=='HEAD')return reply(res,405,{error:'Method not allowed.'});
  let path=url.pathname==='/'?'/index.html':url.pathname;
  if(path.includes('..')||!/^\/[\w/.-]+$/.test(path))return reply(res,404,{error:'Not found'});
  const filename=resolve(ROOT,'.'+path);
  if(!filename.startsWith(ROOT+'/'))return reply(res,403,{error:'Forbidden'});
  try{const content=await readFile(filename);res.writeHead(200,{'Content-Type':mime[extname(filename)]||'application/octet-stream','Cache-Control':['.html','.js','.css'].includes(extname(filename))?'no-cache':'public, max-age=120'});res.end(method==='HEAD'?undefined:content)}
  catch{return reply(res,404,{error:'Not found'});}
 }catch(e){console.error(new Date().toISOString(),url.pathname,e.message);if(!res.headersSent)return reply(res,e.status||((/provider|weather service|AI provider|not configured|unavailable/i).test(e.message)?503:400),{error:e.message});}
};
if(process.env.NODE_ENV!=='test')http.createServer(handler).listen(PORT,'0.0.0.0',()=>console.log(`Paint Weather Advisor: http://localhost:${PORT}`));
export {handler};
