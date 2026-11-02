// Small local retrieval store. Official-source extractions survive server restarts;
// private uploads stay in server memory (24h) and are never written to the shared cache.
import {mkdir, readFile, writeFile, rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {officialManufacturerUrl} from './web-research.mjs';
const DATA_DIR=process.env.KNOWLEDGE_DIR||join(process.cwd(),'data');
const DB=join(DATA_DIR,'manufacturer-knowledge.json');
const uploads=new Map(), MAX=80;
const normalize=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function chunkDocument(text,{size=1200,overlap=180}={}){
 const t=String(text||'').replace(/\s+/g,' ').trim().slice(0,60000);if(!t)return [];
 const chunks=[];for(let i=0;i<t.length&&chunks.length<65;i+=Math.max(100,size-overlap)){
  const x=t.slice(i,i+size);if(x.trim().length>=30)chunks.push(x);if(i+size>=t.length)break;
 }return chunks;
}
export function retrieveChunks(chunks,question,{limit=5}={}){
 const words=new Set(normalize(question).split(' ').filter(w=>w.length>2));
 const q=normalize(question);
 const synonyms={coat:['beschichtungsaufbau','grundbeschichtung','schlussbeschichtung','zwischenbeschichtung','anstrich'],primer:['grundierung','vorbehandlung','grundbeschichtung','untergrundvorbereitung'],dry:['trocknung','trockenzeit','überstreichbar','trocknungsphase'],wait:['überarbeitung','trocknungsdauer','trockenzeit'],interval:['überarbeitung','überstreichbar','stunden'],method:['auftragsverfahren','verarbeitung','walze','rolle','pinsel'],apply:['verarbeitung','auftragsverfahren','beschichtungsaufbau'],mix:['verdünnung','verdünnt','mischung']};
 for(const [word,expands] of Object.entries(synonyms))if(q.includes(word))for(const term of expands)words.add(term);
 // Source headings often contain key instructions even without shared English terms.

 const ranked=(chunks||[]).map((text,i)=>({text,i,score:[...words].reduce((sum,w)=>sum+(normalize(text).includes(w)?1:0),0)}));
 ranked.sort((a,b)=>b.score-a.score||a.i-b.i);
 return ranked.slice(0,Math.min(Math.max(limit,1),8)).map(x=>({text:x.text,position:x.i+1}));
}
export function registerUpload(text){const id=randomUUID();if(uploads.size>MAX){for(const [k,v] of uploads)if(Date.now()>v.expires)uploads.delete(k);if(uploads.size>MAX)uploads.delete(uploads.keys().next().value);}uploads.set(id,{chunks:chunkDocument(text),expires:Date.now()+86400000});return id;}
export function findUploadedContext(id,question){const entry=uploads.get(id);if(!entry||entry.expires<Date.now())return [];return retrieveChunks(entry.chunks,question);}
export async function saveOfficialKnowledge({url,product,extraction,text}){
 if(!officialManufacturerUrl(url)||!product||typeof text!=='string'||text.length<120)throw Error('Only extracted official manufacturer sources can enter this cache.');
 await mkdir(DATA_DIR,{recursive:true});let rows=[];try{rows=JSON.parse(await readFile(DB,'utf8'));if(!Array.isArray(rows))rows=[];}catch{}
 const key=normalize(product), existing=rows.findIndex(x=>x.key===key&&x.url===url);
 const entry={key,product:String(product).slice(0,150),url,checkedAt:new Date().toISOString(),extraction:{product_name:extraction.product_name,manufacturer:extraction.manufacturer,application_temp_min_c:extraction.application_temp_min_c,application_temp_max_c:extraction.application_temp_max_c,drying_temp_min_c:extraction.drying_temp_min_c,drying_temp_max_c:extraction.drying_temp_max_c,recoat_hours_reference:extraction.recoat_hours_reference,rain_protection_hours:extraction.rain_protection_hours,source_evidence:(extraction.source_evidence||[]).slice(0,20)},chunks:chunkDocument(text).slice(0,45)};
 if(existing>=0)rows.splice(existing,1);rows.unshift(entry);rows=rows.slice(0,45);
 const temp=DB+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(rows,null,2),{mode:0o600});await rename(temp,DB);
 return {product:entry.product,url,checkedAt:entry.checkedAt};
}
export async function findOfficialKnowledge(question){let rows=[];try{rows=JSON.parse(await readFile(DB,'utf8'));}catch{return null;}
 const q=normalize(question);const matches=(Array.isArray(rows)?rows:[]).filter(x=>q.includes(x.key)||x.key.includes(q)).sort((a,b)=>b.key.length-a.key.length);
 return matches[0]||null;
}
export async function retrieveOfficialContext(question){const x=await findOfficialKnowledge(question);return x?{product:x.product,url:x.url,checkedAt:x.checkedAt,chunks:retrieveChunks(x.chunks,question)}:null;}
