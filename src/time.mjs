// Resolve wall-clock local datetime to UTC with Intl; refuse DST gaps and ambiguous clocks.
export function localToUTC(local, zone){
 if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(local)) throw new Error('Date/time must be in YYYY-MM-DDTHH:mm format');
 const naive=Date.parse(`${local}:00Z`);
 if(!Number.isFinite(naive) || new Date(naive).toISOString().slice(0,16)!==local) throw new Error('Invalid calendar date/time');
 const f=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const matches=[];
 for(let step=-56;step<=56;step++){ // UTC offsets between -14 and +14 hours, quarter-hour increments
   const stamp=naive + step*15*60000;
   const parts=Object.fromEntries(f.formatToParts(new Date(stamp)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
   if(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`===local) matches.push(stamp);
 }
 if(matches.length===0) throw new Error('This local clock time does not exist (daylight-saving transition). Choose another time.');
 if(matches.length>1) throw new Error('This local time occurs twice (daylight-saving transition). Choose an unambiguous time.');
 return matches[0];
}
export const isoLocal = (ms,zone)=>new Intl.DateTimeFormat('en-GB',{timeZone:zone,day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(ms));
