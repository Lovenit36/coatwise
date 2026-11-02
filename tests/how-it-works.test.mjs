import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const root=new URL('../',import.meta.url);
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
test('how it works card is beneath the chat composer, not inside the chat report',()=>{
  assert.ok(html.includes('<div class="right-column" id="right-column"><main class="main-panel"'));
  assert.match(html,/<div class="chat-composer">[\s\S]*?<\/main>\s*<section class="how-it-works" id="how-it-works"/);
  assert.equal((html.match(/class="how-step"/g)||[]).length,3);
  assert.equal((html.match(/class="empty-guide"/g)||[]).length,0);
  assert.match(html,/class="header-help" href="#how-it-works"/);
});
test('guide explains the three steps and unresolved on-site checks',()=>{
  for (const text of ['How it works','Enter your job','We check','Get advice','What do we check?','Wall temperature and moisture']) assert.ok(html.includes(text),text);
});
test('guide visibility follows reports, restored history, new chats and failed checks',()=>{
  assert.match(js,/function showHowItWorks\(show\)/);
  assert.match(js,/function clearForStart\(\)[\s\S]*?showHowItWorks\(true\)/);
  assert.match(js,/function renderReport\(r,archived=false\)\{showHowItWorks\(false\)/);
  assert.match(js,/function runCheck\(event\)[\s\S]*?showHowItWorks\(false\)/);
  assert.match(js,/catch\(err\)\{showHowItWorks\(true\);wait.remove\(\)/);
});
test('mobile layout and print behavior are defined',()=>{
  assert.match(css,/\.how-steps\{grid-template-columns:1fr/);
  assert.match(css,/@media print\{\.how-it-works\{display:none!important/);
});
