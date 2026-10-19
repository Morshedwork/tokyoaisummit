import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const out=path.join(process.cwd(),'.sites-runtime','page-tests');
await fs.mkdir(out+'/components',{recursive:true});await fs.mkdir(out+'/lib',{recursive:true});
async function compile(source,target){let text=await fs.readFile(source,'utf8');text=text.replaceAll("'@/lib/content'","'../lib/content.mjs'").replaceAll("'next/link'","'next/link.js'");for(const name of ['shared','Motion','EventPages','ProgramExplorer','SpeakerManager','OrganizerTools'])text=text.replaceAll("'./"+name+"'","'./"+name+".mjs'");await fs.writeFile(target,ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText);}
await compile('lib/content.ts',out+'/lib/content.mjs');
for(const name of ['shared','Motion','EventPages','ProgramExplorer','SpeakerManager','OrganizerTools','Summit','MyTickets','Admin'])await compile('app/components/'+name+'.tsx',out+'/components/'+name+'.mjs');
const {default:Summit}=await import(out+'/components/Summit.mjs');
const {defaultEvent,defaultTickets,defaultSessions,eventPages}=await import(out+'/lib/content.mjs');
const data={event:defaultEvent,ticketTypes:defaultTickets,sessions:defaultSessions,speakers:[],paymentReady:false};
const pages={};for(const page of eventPages){const html=renderToStaticMarkup(React.createElement(Summit,{data,page,user:null,isAdmin:false}));pages[page]=html;assert.equal((html.match(/<h1\b/g)||[]).length,1,page+' must have exactly one main heading');assert.match(html,/href="\/speakers"/);assert.match(html,/href="\/attend"/);assert.match(html,/aria-label="Pause decorative motion"/);}
assert.doesNotMatch(pages.home,/class="agenda"|class="ticket-grid"|class="topics-grid"/,'The home page must remain focused');
assert.match(pages.program,/class="agenda"/);assert.doesNotMatch(pages.program,/class="ticket-grid"/);
assert.match(pages.attend,/class="ticket-grid"/);assert.match(pages.about,/class="topics-grid"/);
assert.match(pages.speakers,/SPEAKERS TO BE ANNOUNCED/);assert.match(pages.speakers,/Apply to speak/);
assert.match(pages.showcase,/role="tabpanel"/);
const withSpeaker={...data,speakers:[{id:'test',name:'Test <Voice>',role:'Researcher',organization:'Test Org',bio:'Test biography',photo_url:'',link_url:'',kind:'Keynote',track:'Global 2026',published:1,sort:0}]};
const directory=renderToStaticMarkup(React.createElement(Summit,{data:withSpeaker,page:'speakers',user:null,isAdmin:false}));
assert.match(directory,/Test &lt;Voice&gt;/);assert.match(directory,/aria-label="Search speakers"/);assert.doesNotMatch(directory,/SPEAKERS TO BE ANNOUNCED/);
console.log('PASS: all seven event pages render, have one main heading, link to separate routes, keep detailed content on its own page, and render the speaker directory without fabricated profiles.');

const {PaymentCenter,ActivityView}=await import(out+'/components/OrganizerTools.mjs');
const payments=renderToStaticMarkup(React.createElement(PaymentCenter,{integration:{stripe:false,webhook:false,mode:'not_connected',webhookUrl:'https://example.com/api/stripe/webhook',verifiedAt:null},events:[],busy:false,mutate:async()=>true,event:defaultEvent,types:defaultTickets}));
assert.match(payments,/Setup required/);assert.match(payments,/Verify Stripe connection/);assert.match(payments,/refund.failed/);assert.doesNotMatch(payments,/sk_live_/);
const {default:MyTickets}=await import(out+'/components/MyTickets.mjs');
const passes=renderToStaticMarkup(React.createElement(MyTickets,{initial:{orders:[{id:'test-order',name:'Booker',email:'guest@example.com',quantity:1,ticket_name:'Explorer',amount:0,status:'paid',livemode:1,stripe_id:null,created_at:1,payment_intent:null,refunded_amount:0}],tickets:[{code:'TAS-TEST-1',order_id:'test-order',checked_at:null,attendee_name:'Named Guest'}]},event:defaultEvent,name:'Booker'}));
assert.match(passes,/Named Guest/);assert.match(passes,/Save pass/);assert.match(passes,/Edit attendee/);
const activity=renderToStaticMarkup(React.createElement(ActivityView,{items:[{id:'log1',actor:'owner@example.com',action:'checkin.confirmed',target:'TAS-TEST-1',created_at:1}]}));assert.match(activity,/checkin · confirmed/);
console.log('PASS: organizer payment setup, activity log and named downloadable-pass components render successfully.');
