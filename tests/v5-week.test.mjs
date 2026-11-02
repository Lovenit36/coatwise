import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleRequest,screenWeek} from '../src/week.mjs';
import {localToUTC} from '../src/time.mjs';
const zone='Europe/Berlin';
const job={location:'Sonnenallee 221, 12059 Berlin',dateTime:'2026-11-05T10:00',durationHours:4,surface:'mineral_render',paintId:'muresko'};
const base=localToUTC('2026-11-02T00:00',zone);
function forecast(weather){return {location:'SRH University, Sonnenallee 221',timezone:zone,fetchedAt:'2026-11-02T01:00:00Z',hours:Array.from({length:384},(_,i)=>{const at=base+i*3600000;return {at,temp:weather(at,i),humidity:70,precip:0,wind:5};})};}
test('next week after 5th checks precisely November 6 through 12 (7 days)',()=>{
 const schedule=scheduleRequest('can you check next week after 5th for the entire week?',job);
 assert.deepEqual([schedule.start,schedule.end,schedule.count],['2026-11-06','2026-11-12',7]);
 const result=screenWeek(job,forecast(()=>3),schedule,{now:base});
 assert.equal(result.rows.length,7);assert.equal(result.rows[0].label,'Fri 6 Nov');
 assert.equal(result.rows.at(-1).label,'Thu 12 Nov');
 assert.equal(result.possibleCount,0);
 assert.ok(result.rows.every(row=>row.status==='avoid'));
});
test('suitable day is suggested only if application and full reference drying screening have weather coverage',()=>{
 const schedule=scheduleRequest('check 7 days after 5th',job);
 const warmFrom=localToUTC('2026-11-09T00:00',zone);
 const result=screenWeek(job,forecast(at=>at<warmFrom?2:9),schedule,{now:base});
 assert.equal(result.rows.length,7);
 assert.ok(result.rows.some(r=>r.status==='possible'));
 assert.ok(result.rows.filter(r=>r.status==='possible').every(r=>r.dateTime&&r.date>='2026-11-09'));
});
test('remaining week beyond forecast horizon appears individually, not falsely described as checked',()=>{
 const schedule={start:'2026-11-12',end:'2026-11-18',count:7,requestedHour:'10:00'};
 const result=screenWeek(job,forecast(()=>10),schedule,{now:base});
 assert.equal(result.rows.length,7);assert.equal(result.complete,false);
 assert.ok(result.rows.some(r=>r.status==='outside'));
});
test('malformed requests, unknown dates, no week request are never guessed',()=>{
 assert.equal(scheduleRequest('Is it raining?',job),null);
 assert.equal(scheduleRequest('next week',{}),null);
 assert.equal(scheduleRequest('check the week after 31 November',job),null);
});
