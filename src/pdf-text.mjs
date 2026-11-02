import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
function run(program,args){return new Promise((resolve,reject)=>{
 const p=spawn(program,args,{stdio:['ignore','pipe','pipe'],timeout:12000});let out='',err='';
 p.stdout.on('data',x=>{if(out.length<200000)out+=x.toString()});p.stderr.on('data',x=>{if(err.length<1000)err+=x.toString()});
 p.on('error',reject);p.on('close',c=>c===0?resolve(out):reject(new Error(`Text extraction failed (${c}): ${err.slice(0,120)}`)));
})}
export async function pdfToText(data){
 if(!Buffer.isBuffer(data)||data.length<8||data.subarray(0,5).toString()!=='%PDF-')throw new Error('This file is not a valid PDF.');
 if(data.length>1500000)throw new Error('PDF must be below 1.5 MB.');
 const dir=await fs.mkdtemp(join(tmpdir(),'paint-datasheet-'));
 try{
  const p=join(dir,'input.pdf');await fs.writeFile(p,data,{mode:0o600});
  let content;
  try{content=await run('pdftotext',['-layout','-enc','UTF-8',p,'-']);}
  catch(e){if(e.code==='ENOENT')throw new Error('PDF text extraction is unavailable on this server. Please paste text or deploy with Poppler (pdftotext) installed.');throw e;}
  const clean=content.replace(/\0/g,' ').trim();
  if(clean.length<120)throw new Error('This PDF is scanned, encrypted or has no usable text. Paste the text or upload a text-based datasheet.');
  return clean.slice(0,50000);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
}
