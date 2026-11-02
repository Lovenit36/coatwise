// Research -> official manufacturer evidence -> deterministic weather assessment.
// A search snippet or an LLM claim is NEVER a technical rule. Fetch the real document.
import {officialManufacturerUrl} from './web-research.mjs';
import {extractWithAI,approvedUploadToPaint} from './ai.mjs';
import {pdfToText} from './pdf-text.mjs';
import {assess} from './engine.mjs';
import {getForecast} from './weather.mjs';
import {saveOfficialKnowledge} from './knowledge.mjs';

const MAX_BYTES=1_500_000;
function norm(s){return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f®™]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
export function matchesResearchedProduct(question,product){
 const target=norm(product);
 return target.length>=7 && target.split(' ').length>=2 && norm(question).includes(target);
}
function decodeHtml(s){return s.replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(Number(n),0x10ffff)));}
function htmlToText(s){return decodeHtml(s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()).slice(0,50000);}
async function bytesLimited(response){
 const reader=response.body?.getReader();if(!reader){const b=Buffer.from(await response.arrayBuffer());if(b.length>MAX_BYTES)throw Error('Manufacturer document too large');return b;}
 const parts=[];let total=0;try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_BYTES)throw Error('Manufacturer document too large');parts.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
 return Buffer.concat(parts,total);
}
export async function retrieveManufacturerDocument(url,{fetcher=fetch,pdfReader=pdfToText}={}){
 if(!officialManufacturerUrl(url))throw Error('Only HTTPS manufacturer documentation is permitted.');
 let current=url;
 for(let i=0;i<3;i++){
  if(!officialManufacturerUrl(current))throw Error('Manufacturer link redirects outside approved manufacturer domains.');
  const r=await fetcher(current,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{Accept:'application/pdf, text/html, text/plain'}});
  if([301,302,303,307,308].includes(r.status)){
   const redirect=r.headers.get('location');if(!redirect)throw Error('Manufacturer redirect had no destination.');
   current=new URL(redirect,current).href;continue;
  }
  if(!r.ok)throw Error(`Manufacturer document returned HTTP ${r.status}.`);
  const type=(r.headers.get('content-type')||'').toLowerCase();
  if(!/application\/pdf|text\/html|text\/plain|application\/octet-stream/i.test(type) && !/\.pdf(?:[?#]|$)/i.test(current))throw Error('Manufacturer URL did not provide a readable document.');
  const data=await bytesLimited(r);
  if(data.subarray(0,5).toString()==='%PDF-')return {url:current,text:await pdfReader(data)};
  if(type.includes('pdf'))throw Error('Manufacturer PDF could not be decoded.');
  const text=htmlToText(data.toString('utf8'));
  if(text.length<120)throw Error('Manufacturer page contained insufficient text.');
  return {url:current,text};
 }
 throw Error('Too many manufacturer redirects.');
}
function noCheck(message,source){return {status:'needs_document',answer:message, ...(source?{source}:{}),checked:false};}
export async function checkResearchedPaint(search,question,job,{fetcher=fetch,documentReader=retrieveManufacturerDocument,extractor=extractWithAI,forecastReader=getForecast}={}){
 if(!job?.location||!job?.dateTime||!job?.surface||!job?.durationHours)return noCheck('I found manufacturer research, but I need a complete job (address, date, hours and wall type) before checking the weather.');
 if(!search?.sources?.length)return noCheck('I could not find an official manufacturer document. Share the exact paint name or upload the datasheet.');
 let detail='';
 for(const source of search.sources.slice(0,4)){
  try{
   const document=await documentReader(source.url,{fetcher});
   if(!document?.text||!officialManufacturerUrl(document.url))continue;
   const extracted=await extractor(document.text,{fetcher});
   if(!matchesResearchedProduct(question,extracted.product_name)||!norm(document.text).includes(norm(extracted.product_name))){
    detail='The document did not match the paint name you asked about.';continue;
   }
   if(extracted.application_temp_min_c===null||extracted.application_temp_max_c===null){
    detail='The document did not provide sufficiently verified working-temperature limits.';continue;
   }
   const paint=approvedUploadToPaint({...extracted,userApproved:true});
   // Save verifiable document chunks for later conversations; a failed disk write must not change the assessment.
   await saveOfficialKnowledge({url:document.url,product:`${extracted.manufacturer} ${extracted.product_name}`,extraction:extracted,text:document.text}).catch(()=>{});
   paint.id='researched';paint.source=document.url;paint.sourceVersion='Live manufacturer document; AI-extracted values matched to original text';
   paint.evidence.sourceEvidence=extracted.source_evidence;
   // The uploaded-paint adapter does not infer substrate suitability or a drying duration.
   const forecast=await forecastReader(job.location);
   const result=assess(paint,job,forecast);
   const relevant=result.conflicts.filter(f=>['temp_low','temp_high','rain_during_work','surface'].includes(f.code));
   const incomplete=!result.coverageComplete||result.unknown.some(f=>['temp_limit_missing','rain_missing','temp_missing'].includes(f.code)) || result.rain.rainInScreen || result.rain.earlyRainRisk;
   const status=relevant.length?'conflict':incomplete?'incomplete':'conditional';
   const first=relevant[0];
   const reason=first?first.message:(result.rain.rainInScreen&&paint.rainProtectionHours===null)?'Rain is forecast during drying, and the maker has not documented an early rain-protection time.':result.rain.earlyRainRisk?'Rain is forecast before documented early shower resistance.':result.rain.rainInScreen?'Rain is forecast during drying; early shower resistance does not establish full rain protection.':incomplete?'Some manufacturer limits or forecast hours are missing.':'No documented working-temperature or application-rain conflict was found in the checked hours.';
   const minTemp=result.hours.filter(h=>h.phase==='application').map(h=>h.temp).filter(Number.isFinite);
   const short={product:`${paint.brand} ${paint.name}`,source:document.url,status,verdict:status==='conflict'?'Not recommended for this job':status==='incomplete'?'Not enough data to confirm':'Weather check passed — site checks needed',reason,
    workTempMin:minTemp.length?Math.min(...minTemp):null,workTempMax:minTemp.length?Math.max(...minTemp):null,
    limits:{applicationMin:paint.min,applicationMax:paint.max,dryingMin:paint.dryingMin,dryingMax:paint.dryingMax,recoatHours:paint.recoatHours,rainProtectionHours:paint.rainProtectionHours},
    rain:result.rain,rainDetail:result.rain.wetWork?'Rain during application':result.rain.rainInScreen?'Rain forecast during drying screening':'No rain forecast during checked application/drying hours',sourceQuotes:extracted.source_evidence.slice(0,8),
    missing:[...new Set([...(result.unknown||[]).filter(f=>['surface','substrate_temp','rain_unknown','forecast_gap','dry_unknown','temp_limit_missing'].includes(f.code)).map(f=>f.message)])].slice(0,4),
    forecastFetchedAt:forecast.fetchedAt,location:forecast.location,checkedHours:result.hours.length};
   const answer=`${short.verdict}: ${paint.name}. ${reason} ${status!=='conflict'?'Confirm wall condition and the exact manufacturer system before painting.':''}`;
   return {checked:true,status,answer,check:short,sources:search.sources};
  }catch(e){detail=String(e.message||e).slice(0,130);}
 }
 return noCheck(`I found a manufacturer source, but could not verify enough technical data for a safe job comparison${detail?`: ${detail}`:''}. Open the official sheet or upload it for review.`,search.sources[0]?.url);
}
