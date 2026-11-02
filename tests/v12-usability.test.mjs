import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {requestedPlanPaint,planReply,compactPlanSteps} from '../src/plan-response.mjs';
import {readPlanRequest,buildWorkItinerary,parsePlanOptions} from '../src/itinerary.mjs';
import {byId} from '../src/catalogue.mjs';
import {localToUTC} from '../src/time.mjs';
const baseJob={location:'Sonnenallee 221 Berlin',paintId:'thermosan',dateTime:'2026-11-05T08:00',durationHours:7,surface:'concrete'};
const zone='Europe/Berlin';
function fakeForecast(temperature){const start=localToUTC('2026-11-02T00:00',zone);return {timezone:zone,location:'Berlin',fetchedAt:'2026-11-02T08:00:00Z',hours:Array.from({length:384},(_,i)=>({at:start+i*3600000,temp:temperature,precip:0,precipProbability:0,humidity:70}))};}
test('explicit switch to Sandtex, even if misspelled sandtax, does not use previous ThermoSan paint',()=>{
 assert.equal(requestedPlanPaint('ok then I use sandtax just do me a plan for 5th till 6th',baseJob.paintId)?.id,'sandtex365');
 assert.equal(requestedPlanPaint('Make an itinerary for Sandtex Trade 365 All Weather Masonry Paint',baseJob.paintId)?.id,'sandtex365');
 assert.equal(requestedPlanPaint('just make a plan',baseJob.paintId),null);
});
test('5th till 6th means two days, even without a number of available days',()=>{
 assert.equal(readPlanRequest('make a plan from 5th till 6th',{},baseJob).daysAvailable,2);
});
test('wall dimensions are optional and yield gross square metre area, not invented material quantity',()=>{
 const options=readPlanRequest('Please plan for my wall 8m by 3m',{},baseJob);
 assert.equal(options.wallWidthM,8);assert.equal(options.wallHeightM,3);
 const plan=buildWorkItinerary(baseJob,byId('thermosan'),fakeForecast(12),{...options,coats:1,workHoursPerCoat:4,prepHours:1},{now:localToUTC('2026-11-02T00:00',zone)});
 assert.equal(plan.areaM2,24);
 assert.match(planReply(plan,byId('thermosan')),/24 m²/);
 assert.match(planReply(plan,byId('thermosan')),/coverage/i);
});
test('default does not assert two coats are required without datasheet evidence',()=>{
 assert.equal(parsePlanOptions({},baseJob).coats,1);
});
test('all-weather block yields a concise non-approval, and repetitive blocked days are hidden',()=>{
 const opts={coats:2,dailyStart:9,dailyHours:8,workHoursPerCoat:7,prepHours:2,daysAvailable:2};
 const plan=buildWorkItinerary(baseJob,byId('thermosan'),fakeForecast(2),opts,{now:localToUTC('2026-11-02T00:00',zone)});
 assert.equal(plan.complete,false);
 assert.match(planReply(plan,byId('thermosan')),/No verified.*ThermoSan/);
 assert.match(planReply(plan,byId('thermosan')),/width and height/);
 assert.equal(compactPlanSteps(plan).flatMap(d=>d.steps).some(s=>s.type==='coat'&&s.status==='blocked'),false);
});
test('fixed desktop chat layout and compact clickable weather breakdown are in the frontend',async()=>{
 const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');
 const js=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(css,/\.workspace>\.right-column\{height:100%;min-height:0;overflow:hidden/);
 assert.match(css,/\.main-panel>\.conversation-scroll\{min-height:0;overflow-y:auto/);
 assert.match(js,/View weather &amp; verdict by date/);
 assert.match(js,/day\.steps\.filter\(step=>step\.type!=='coat'\|\|step\.status==='conditional'\)/);
});
test('dimensions-only follow-up can regenerate existing plan without guessing new requirements',()=>{
 const {wallWidthM,wallHeightM}=readPlanRequest('width is 8m height is 3m',{coats:1,workHoursPerCoat:4},baseJob);
 assert.equal(wallWidthM,8);assert.equal(wallHeightM,3);
});
