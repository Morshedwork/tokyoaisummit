import {env} from 'cloudflare:workers';
import Stripe from 'stripe';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {defaultEvent,defaultSessions,defaultTickets,type EventSettings,type TicketType,type Session,type Speaker} from './content';
import {isAdminEmail,paymentMatches} from './rules';
export const runtime=()=>env;
export function db(){if(!env.DB)throw new Error('Database unavailable');return env.DB;}
let seeded:Promise<void>|null=null;
export async function ensureSeed(){if(!seeded)seeded=(async()=>{const d=db();if(await d.prepare("SELECT key FROM settings WHERE key='seeded'").first())return;await d.batch([
 d.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').bind('event',JSON.stringify(defaultEvent)),
 ...defaultTickets.map(t=>d.prepare('INSERT OR IGNORE INTO ticket_types (id,name,price,capacity,description,features,active,sort) VALUES (?,?,?,?,?,?,?,?)').bind(t.id,t.name,t.price,t.capacity,t.description,t.features,t.active,t.sort)),
 ...defaultSessions.map(s=>d.prepare('INSERT OR IGNORE INTO sessions (id,start,end,title,category,stage,description,speaker,sort) VALUES (?,?,?,?,?,?,?,?,?)').bind(s.id,s.start,s.end,s.title,s.category,s.stage,s.description,s.speaker,s.sort)),
 d.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('seeded','1')")
]);})().catch(e=>{seeded=null;throw e;});await seeded;}
export async function getEvent(){await ensureSeed();const row=await db().prepare('SELECT value FROM settings WHERE key=?').bind('event').first<{value:string}>();return {...defaultEvent,...JSON.parse(row!.value)} as EventSettings;}
export async function getPublic(){const event=await getEvent();const [types,sessions,speakers]=await Promise.all([
 db().prepare("SELECT t.*, COALESCE((SELECT SUM(quantity) FROM orders WHERE type_id=t.id AND status='paid'),0) sold, COALESCE((SELECT SUM(quantity) FROM orders WHERE type_id=t.id AND status IN ('pending','refund_pending')),0) reserved FROM ticket_types t ORDER BY sort").all<TicketType>(),
 db().prepare('SELECT * FROM sessions ORDER BY start,sort').all<Session>(),
 db().prepare('SELECT * FROM speakers WHERE published=1 ORDER BY sort,name').all<Speaker>()
]);return {event,ticketTypes:types.results,sessions:sessions.results,speakers:speakers.results,paymentReady:!!env.STRIPE_SECRET_KEY && !!env.STRIPE_WEBHOOK_SECRET};}
export async function adminUser(){const user=await getChatGPTUser();return user&&isAdminEmail(user.email,env.ADMIN_EMAILS)?user:null;}
export function stripe(){if(!env.STRIPE_SECRET_KEY)throw new Error('Payments are not configured.');return new Stripe(env.STRIPE_SECRET_KEY,{httpClient:Stripe.createFetchHttpClient(),maxNetworkRetries:2});}
export function siteUrl(){if(!env.SITE_URL)throw new Error('Site URL is not configured');return env.SITE_URL.replace(/\/$/,'');}
export type Order={id:string;user_id:string;type_id:string;quantity:number;name:string;email:string;company:string;status:string;amount:number;created_at:number;expires_at:number;stripe_id:string|null;payment_intent:string|null;livemode:number;request_key:string|null;attendee_names:string;ticket_label:string;checkout_title:string;refund_id:string|null;refund_status:string|null;refunded_amount:number};
export function ticketOperations(order:Order){
 const names=JSON.parse(order.attendee_names||'[]') as string[];
 return Array.from({length:order.quantity},(_,i)=>db().prepare("INSERT OR IGNORE INTO tickets (code,order_id,attendee_name) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM orders WHERE id=? AND status='paid')").bind('TAS-'+order.id.replaceAll('-','').slice(0,16).toUpperCase()+'-'+(i+1),order.id,names[i]||order.name,order.id));
}
export async function fulfillFree(order:Order){
 if(order.amount!==0)return;
 await db().batch([db().prepare("UPDATE orders SET status='paid' WHERE id=? AND status='pending' AND amount=0").bind(order.id),...ticketOperations(order)]);
}
export async function fulfill(session:Stripe.Checkout.Session){
 const id=session.metadata?.order_id;if(!id)return;
 const order=await db().prepare('SELECT * FROM orders WHERE id=?').bind(id).first<Order>();
 if(!order||!paymentMatches(order,session)||!['pending','paid'].includes(order.status))return;
 await db().batch([db().prepare("UPDATE orders SET status='paid',stripe_id=?,payment_intent=? WHERE id=? AND status IN ('pending','paid')").bind(session.id,typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id||null,id),...ticketOperations(order)]);
}
export async function checkoutUrl(order:Order){
 if(order.status==='paid')return '/tickets';
 if(order.status!=='pending')throw new Error('This order is closed. Choose your passes again.');
 if(order.amount===0){await fulfillFree(order);return '/tickets?registered=1';}
 const client=stripe();
 if(order.stripe_id){const session=await client.checkout.sessions.retrieve(order.stripe_id);if(session.payment_status==='paid'){await fulfill(session);return '/tickets';}if(session.status!=='open'){await syncOrder(order);throw new Error('This checkout is no longer open. Refresh your tickets.');}return session.url;}
 // Retry an uncertain request with the SAME payload and Stripe idempotency key.
 // Once the original expiry is past, reconciliation must find the session first.
 if(order.expires_at<=Date.now()+30*60000)throw new Error('This checkout needs reconciliation. Open My tickets and refresh, or contact the organizer.');
 const session=await client.checkout.sessions.create({mode:'payment',allowed_payment_method_types:['card'],customer_email:order.email,client_reference_id:order.id,metadata:{order_id:order.id},payment_intent_data:{metadata:{order_id:order.id},receipt_email:order.email},expires_at:Math.floor(order.expires_at/1000),line_items:[{price_data:{currency:'jpy',unit_amount:order.amount/order.quantity,product_data:{name:order.checkout_title}},quantity:order.quantity}],success_url:siteUrl()+'/tickets?session_id={CHECKOUT_SESSION_ID}',cancel_url:siteUrl()+'/tickets?cancelled=1'},{idempotencyKey:'checkout-'+order.id});
 await db().prepare('UPDATE orders SET stripe_id=? WHERE id=? AND (stripe_id IS NULL OR stripe_id=?)').bind(session.id,order.id,session.id).run();return session.url;
}
export async function applyCharge(charge:Stripe.Charge){
 const intent=typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent?.id;
 if(!intent)return;
 await db().prepare("UPDATE orders SET refunded_amount=?,status=CASE WHEN ?=1 THEN 'refunded' ELSE status END,refund_status=CASE WHEN ?=1 THEN 'succeeded' ELSE refund_status END WHERE payment_intent=? AND livemode=?").bind(charge.amount_refunded,Number(charge.refunded),Number(charge.refunded),intent,Number(charge.livemode)).run();
}
export async function syncRefund(order:Order){
 if(!order.payment_intent)return;
 const pi=await stripe().paymentIntents.retrieve(order.payment_intent,{expand:['latest_charge']});
 if(pi.latest_charge&&typeof pi.latest_charge!=='string')await applyCharge(pi.latest_charge);
 if(!order.refund_id&&order.status==='refund_pending'){
  // Recover an ambiguous refund without submitting another money movement.
  const list=await stripe().refunds.list({payment_intent:order.payment_intent,limit:100});
  const found=list.data.find(r=>r.metadata?.order_id===order.id);
  if(found){order.refund_id=found.id;await db().prepare('UPDATE orders SET refund_id=? WHERE id=?').bind(found.id,order.id).run();}
  else if(!(pi.latest_charge&&typeof pi.latest_charge!=='string'&&pi.latest_charge.refunded))throw new Error('Refund outcome needs review in Stripe.');
 }
 if(order.refund_id){const refund=await stripe().refunds.retrieve(order.refund_id);await db().prepare("UPDATE orders SET refund_status=?,status=CASE WHEN status='refunded' THEN status WHEN ?='succeeded' AND ?>=amount THEN 'refunded' WHEN ? IN ('failed','canceled') THEN 'paid' ELSE status END,refunded_amount=CASE WHEN ?='succeeded' THEN MAX(refunded_amount,?) ELSE refunded_amount END WHERE id=?").bind(refund.status||'pending',refund.status||'pending',refund.amount,refund.status||'pending',refund.status||'pending',refund.amount,order.id).run();}
}
export async function syncOrder(order:Order){
 if(order.status==='refund_pending'){await syncRefund(order);return;}
 if(order.status!=='pending')return;
 if(order.amount===0){await fulfillFree(order);return;}
 if(!order.stripe_id){
  const list=await stripe().checkout.sessions.list({created:{gte:Math.floor(order.created_at/1000)-5,lte:Math.floor(order.created_at/1000)+300},limit:100});
  const found=list.data.find(s=>s.metadata?.order_id===order.id&&Number(s.livemode)===order.livemode);
  if(found){order.stripe_id=found.id;await db().prepare('UPDATE orders SET stripe_id=? WHERE id=?').bind(found.id,order.id).run();}
  else if(!list.has_more&&order.expires_at<Date.now())await db().prepare("UPDATE orders SET status='expired' WHERE id=? AND status='pending'").bind(order.id).run();
 }
 if(order.stripe_id){const session=await stripe().checkout.sessions.retrieve(order.stripe_id);if(session.payment_status==='paid')await fulfill(session);else if(session.status==='expired')await db().prepare("UPDATE orders SET status='expired' WHERE id=? AND status='pending'").bind(order.id).run();}
}
export async function orderTickets(userId:string){const orders=await db().prepare("SELECT o.*,COALESCE(NULLIF(o.ticket_label,''),t.name) AS ticket_name FROM orders o JOIN ticket_types t ON t.id=o.type_id WHERE user_id=? ORDER BY created_at DESC").bind(userId).all();const tickets=await db().prepare('SELECT t.* FROM tickets t JOIN orders o ON o.id=t.order_id WHERE o.user_id=? AND o.status=?').bind(userId,'paid').all();return {orders:orders.results,tickets:tickets.results};}
export async function audit(actor:string,action:string,target=''){await db().prepare('INSERT INTO audit_log (id,actor,action,target,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,target,Date.now()).run();}
export async function keyFingerprint(){if(!env.STRIPE_SECRET_KEY)return '';const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.STRIPE_SECRET_KEY));return Array.from(new Uint8Array(hash)).map(n=>n.toString(16).padStart(2,'0')).join('');}
