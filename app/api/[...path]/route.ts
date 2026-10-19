import {env} from 'cloudflare:workers';
import Stripe from 'stripe';
import {z} from 'zod';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {adminUser,db,ensureSeed,fulfill,getEvent,getPublic,orderTickets,siteUrl,stripe,syncOrder,checkoutUrl,applyCharge,syncRefund,audit,keyFingerprint,type Order} from '@/lib/server';
import {reserveSql,validOrigin,csvCell} from '@/lib/rules';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fail=(message:string,status=400)=>json({error:message},status);
const short=z.string().trim().min(1).max(160),email=z.string().trim().email().max(254),text=z.string().trim().max(4000);
const eventSchema=z.object({title:short,year:z.string().regex(/^20\d{2}$/),theme:short,tagline:z.string().max(220),date:z.string().refine(v=>!v||/^\d{4}-\d{2}-\d{2}$/.test(v)),dateLabel:short,venue:short,address:z.string().max(500),time:short,salesOpen:z.boolean(),contactEmail:email,refundPolicy:text,announcement:z.string().max(220),legalName:short,legalAddress:z.string().max(500),legalPhone:z.string().max(80)});
const typeSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),name:short,price:z.number().int().min(0).max(1000000),capacity:z.number().int().min(0).max(100000),description:z.string().max(240),features:z.array(z.string().max(120)).max(15),active:z.boolean(),sort:z.number().int().min(0).max(1000)});
const sessionSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),start:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),end:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),title:short,category:short,stage:short,description:text,speaker:short,sort:z.number().int().min(0).max(1000)}).refine(s=>s.end>s.start,{message:'End time must be after start time.'});
const httpsUrl=z.string().trim().max(2000).refine(value=>{if(!value)return true;try{return new URL(value).protocol==='https:';}catch{return false;}},{message:'Use a valid HTTPS URL or leave the field empty.'});
const speakerSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),name:short,role:short,organization:z.string().trim().max(160),bio:text,photo_url:httpsUrl,link_url:httpsUrl,track:short,kind:z.enum(['Keynote','Fireside','Panel','Host']),published:z.boolean(),sort:z.number().int().min(0).max(1000)});
const pathOf=(req:Request)=>new URL(req.url).pathname.replace(/^\/api\//,'');
async function dashboard(){const data=await getPublic();const [orders,tickets,inquiries,speakers,activity,paymentEvents,verification]=await Promise.all([
 db().prepare("SELECT o.*,COALESCE(NULLIF(o.ticket_label,''),t.name) AS ticket_name FROM orders o JOIN ticket_types t ON t.id=o.type_id ORDER BY o.created_at DESC LIMIT 5000").all(),
 db().prepare("SELECT t.*,COALESCE(NULLIF(t.attendee_name,''),o.name) AS name,o.email,COALESCE(NULLIF(o.ticket_label,''),tt.name) AS ticket_name,o.livemode,o.amount FROM tickets t JOIN orders o ON o.id=t.order_id JOIN ticket_types tt ON tt.id=o.type_id WHERE o.status='paid' ORDER BY o.created_at DESC LIMIT 10000").all(),
 db().prepare('SELECT id,kind,name,email,company,message,created_at,status FROM inquiries ORDER BY created_at DESC LIMIT 5000').all(),
 db().prepare('SELECT * FROM speakers ORDER BY sort,name').all(),
 db().prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100').all(),
 db().prepare('SELECT * FROM payment_events ORDER BY received_at DESC LIMIT 30').all(),
 db().prepare("SELECT value FROM settings WHERE key='stripe_verification'").first<{value:string}>()
]);const verified=verification?JSON.parse(verification.value):null;return {...data,orders:orders.results,tickets:tickets.results,inquiries:inquiries.results,speakers:speakers.results,activity:activity.results,paymentEvents:paymentEvents.results,integration:{stripe:!!env.STRIPE_SECRET_KEY,webhook:!!env.STRIPE_WEBHOOK_SECRET,mode:env.STRIPE_SECRET_KEY?(env.STRIPE_SECRET_KEY.includes('_test_')?'test':'live'):'not_connected',webhookUrl:siteUrl()+'/api/stripe/webhook',verifiedAt:verified?.fingerprint===await keyFingerprint()?verified?.checkedAt:null}};}
function csvResponse(rows:Record<string,unknown>[],cols:string[],name:string){return new Response('\ufeff'+[cols.map(csvCell).join(','),...rows.map(r=>cols.map(k=>csvCell(r[k])).join(','))].join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="tokyo-ai-summit-${name}.csv"`,'Cache-Control':'no-store'}});}
export async function GET(req:Request){try{await ensureSeed();const path=pathOf(req);const user=await getChatGPTUser();
 if(path==='public')return json({...await getPublic(),user:user?{name:user.displayName,email:user.email}:null,isAdmin:!!await adminUser()});
 if(path==='tickets'){if(!user)return fail('Sign in to see your tickets.',401);return json(await orderTickets(user.userId));}
 if(path==='receipt'){
 if(!user)return fail('Sign in to view this receipt.',401);
 const id=new URL(req.url).searchParams.get('id')||'';const order=await db().prepare('SELECT * FROM orders WHERE id=?').bind(id).first<Order>();
 if(!order||(order.user_id!==user.userId&&!await adminUser()))return fail('Order not found.',404);
 if(!order.payment_intent)return fail('No Stripe receipt is available for this order.',404);
 const payment=await stripe().paymentIntents.retrieve(order.payment_intent,{expand:['latest_charge']});
 const charge=payment.latest_charge;if(!charge||typeof charge==='string'||!charge.receipt_url)return fail('Receipt is not available yet.',404);
 return Response.redirect(charge.receipt_url,303);
 }
 if(path==='admin'||path.startsWith('admin/')){
 if(!await adminUser())return fail('Organizer access is required.',403);
 if(path==='admin/export'){const rows=await db().prepare("SELECT o.id,o.name,o.email,o.company,COALESCE(NULLIF(o.ticket_label,''),tt.name) AS ticket,o.quantity,o.amount,o.refunded_amount,o.status,o.livemode,o.created_at FROM orders o JOIN ticket_types tt ON tt.id=o.type_id ORDER BY o.created_at DESC").all();return csvResponse(rows.results,['id','name','email','company','ticket','quantity','amount','refunded_amount','status','livemode','created_at'],'orders');}
 if(path==='admin/export-tickets'){const rows=await db().prepare("SELECT t.code,COALESCE(NULLIF(t.attendee_name,''),o.name) AS attendee,o.email,o.company,o.id AS order_id,COALESCE(NULLIF(o.ticket_label,''),tt.name) AS ticket,o.status,o.livemode,t.checked_at FROM tickets t JOIN orders o ON o.id=t.order_id JOIN ticket_types tt ON tt.id=o.type_id ORDER BY o.created_at DESC").all();return csvResponse(rows.results,['code','attendee','email','company','order_id','ticket','status','livemode','checked_at'],'passes');}
 if(path==='admin/export-applications'){const rows=await db().prepare('SELECT id,kind,name,email,company,message,status,created_at FROM inquiries ORDER BY created_at DESC').all();return csvResponse(rows.results,['id','kind','name','email','company','message','status','created_at'],'applications');}
 if(path==='admin/order'){const id=new URL(req.url).searchParams.get('id')||'';const order=await db().prepare("SELECT o.*,COALESCE(NULLIF(o.ticket_label,''),tt.name) AS ticket_name FROM orders o JOIN ticket_types tt ON tt.id=o.type_id WHERE o.id=?").bind(id).first();if(!order)return fail('Order not found.',404);const tickets=await db().prepare('SELECT * FROM tickets WHERE order_id=?').bind(id).all();return json({order,tickets:tickets.results});}
 if(path==='admin')return json(await dashboard());
 }
 return fail('Not found.',404);
}catch(e){console.error('GET request failed',e instanceof Error?e.message:'Unknown');return fail('Unable to load data. Please try again.',500);}}
export async function POST(req:Request){try{
 const path=pathOf(req);
 if(path==='stripe/webhook')return webhook(req);
 if(!validOrigin(req.headers.get('origin'),siteUrl()))return fail('Request origin was not accepted.',403);
 if(Number(req.headers.get('content-length')||0)>24000)return fail('Request too large.',413);
 await ensureSeed();const raw=await req.text();if(raw.length>24000)return fail('Request too large.',413);let body;try{body=JSON.parse(raw);}catch{return fail('Invalid request.');}
 if(path==='inquiries'){
 const b=z.object({kind:z.enum(['waitlist','sponsor','speaker','exhibitor']),name:short,email,company:z.string().max(160).default(''),message:text.default(''),website:z.string().max(500).default('')}).parse(body);if(b.website)return json({ok:true});
 const ip=req.headers.get('cf-connecting-ip')||b.email.toLowerCase();const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip));const key=Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('');
 const count=await db().prepare('SELECT COUNT(*) AS n FROM inquiries WHERE rate_key=? AND created_at>?').bind(key,Date.now()-3600000).first<{n:number}>();if((count?.n||0)>=5)return fail('You have already sent several requests. Please try again later.',429);
 const existing=await db().prepare('SELECT id FROM inquiries WHERE lower(email)=? AND kind=? AND created_at>?').bind(b.email.toLowerCase(),b.kind,Date.now()-3600000).first();if(existing)return json({ok:true});
 await db().prepare('INSERT INTO inquiries (id,kind,name,email,company,message,created_at,status,rate_key) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),b.kind,b.name,b.email,b.company,b.message,Date.now(),'new',key).run();return json({ok:true});
 }
 const user=await getChatGPTUser();if(!user)return fail('Please sign in to continue.',401);
 if(path==='checkout'){
 const b=z.object({typeId:short,quantity:z.number().int().min(1).max(6),name:short,company:z.string().max(160).default(''),acceptTerms:z.literal(true),requestKey:z.string().uuid().optional(),attendees:z.array(short).max(6).optional()}).parse(body);
 if(b.attendees&&b.attendees.length!==b.quantity)return fail('Add a name for each pass.');
 const requestKey=user.userId+':'+(b.requestKey||crypto.randomUUID());
 const previous=await db().prepare('SELECT * FROM orders WHERE request_key=? AND user_id=?').bind(requestKey,user.userId).first<Order>();
 if(previous){if(previous.type_id!==b.typeId||previous.quantity!==b.quantity||previous.name!==b.name||previous.company!==b.company||previous.attendee_names!==JSON.stringify(b.attendees||Array(b.quantity).fill(b.name)))return fail('Your booking changed. Close this form and start a new booking.',409);try{return json({url:await checkoutUrl(previous)});}catch(e){return fail(e instanceof Error?e.message:'Unable to resume checkout.',409);}}
 const event=await getEvent();if(!event.salesOpen)return fail('Ticket sales have not opened yet. Join the announcement list to hear first.',409);
 const type=await db().prepare('SELECT * FROM ticket_types WHERE id=? AND active=1').bind(b.typeId).first<{id:string;name:string;price:number}>();if(!type)return fail('This ticket is unavailable.',404);
 if(type.price>0&&(!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET))return fail('Paid tickets are not available yet.',503);
 if(type.price>0&&type.price*b.quantity<50)return fail('Paid JPY checkouts must total at least ¥50. Contact the organizer.');
 if(env.STRIPE_SECRET_KEY){const holds=await db().prepare("SELECT * FROM orders WHERE type_id=? AND status='pending' AND expires_at<? LIMIT 10").bind(type.id,Date.now()).all<Order>();for(const hold of holds.results)await syncOrder(hold);}
 const recent=await db().prepare("SELECT COUNT(*) n FROM orders WHERE user_id=? AND created_at>?").bind(user.userId,Date.now()-3600000).first<{n:number}>();if((recent?.n||0)>=10)return fail('Too many checkout attempts. Please try again later.',429);
 const id=crypto.randomUUID(),now=Date.now(),amount=type.price*b.quantity,live=amount===0?1:Number(!env.STRIPE_SECRET_KEY!.includes('_test_'));
 const reservation=await db().prepare(reserveSql).bind(id,user.userId,type.id,b.quantity,b.name,user.email,b.company,amount,now,now+35*60000,live,requestKey,JSON.stringify(b.attendees||Array(b.quantity).fill(b.name)),type.name,`${event.title} ${event.year} · ${type.name}`,type.id,type.price,b.quantity).run();
 const order=await db().prepare('SELECT * FROM orders WHERE request_key=? AND user_id=?').bind(requestKey,user.userId).first<Order>();
 if(!reservation.meta.changes&&!order)return fail('There are not enough tickets available. Please reduce the quantity.',409);
 if(order&&(order.type_id!==b.typeId||order.quantity!==b.quantity||order.name!==b.name||order.company!==b.company||order.attendee_names!==JSON.stringify(b.attendees||Array(b.quantity).fill(b.name))))return fail('This request already belongs to a different booking. Start a new booking.',409);
 try{return json({url:await checkoutUrl(order!)});}catch(e){if(e instanceof Stripe.errors.StripeInvalidRequestError||e instanceof Stripe.errors.StripeAuthenticationError)await db().prepare("UPDATE orders SET status='expired' WHERE id=? AND status='pending'").bind(order!.id).run();console.error('Stripe checkout failed',e instanceof Error?e.name:'Unknown');return fail('Checkout could not be opened. Check My tickets before starting another booking.',502);}
 }
 if(path==='verify'){
 const b=z.object({sessionId:z.string().regex(/^cs_[a-zA-Z0-9_]+$/)}).parse(body);const order=await db().prepare('SELECT * FROM orders WHERE stripe_id=? AND user_id=?').bind(b.sessionId,user.userId).first<Order>();if(!order)return fail('Order not found.',404);await syncOrder(order);return json(await orderTickets(user.userId));
 }
 if(path==='sync-my-orders'){
 if(env.STRIPE_SECRET_KEY){const pending=await db().prepare("SELECT * FROM orders WHERE user_id=? AND status IN ('pending','refund_pending') LIMIT 20").bind(user.userId).all<Order>();for(const order of pending.results)await syncOrder(order);}return json({ok:true});
 }
 if(path==='resume-order'){
 const b=z.object({id:short}).parse(body);const order=await db().prepare('SELECT * FROM orders WHERE id=? AND user_id=?').bind(b.id,user.userId).first<Order>();if(!order)return fail('Order not found.',404);try{return json({url:await checkoutUrl(order)});}catch(e){return fail(e instanceof Error?e.message:'Unable to resume checkout.',409);}
 }
 if(path==='ticket-name'){
 const b=z.object({code:short,name:short}).parse(body);
 const changed=await db().prepare("UPDATE tickets SET attendee_name=? WHERE code=? AND checked_at IS NULL AND EXISTS(SELECT 1 FROM orders WHERE id=tickets.order_id AND user_id=? AND status='paid')").bind(b.name,b.code,user.userId).run();
 if(!changed.meta.changes)return fail('Only your unused, confirmed passes can be updated.',409);return json({ok:true});
 }
 if(path==='cancel-order'){
 const b=z.object({id:short}).parse(body);let order=await db().prepare('SELECT * FROM orders WHERE id=? AND user_id=?').bind(b.id,user.userId).first<Order>();if(!order)return fail('Order not found.',404);
 if(order.status==='pending'&&!order.stripe_id){await syncOrder(order);order=await db().prepare('SELECT * FROM orders WHERE id=? AND user_id=?').bind(b.id,user.userId).first<Order>();}
 if(order?.status==='expired')return json({ok:true});
 if(!order||order.status!=='pending'||!order.stripe_id)return fail('This hold cannot be released yet. Refresh status or contact the organizer.',409);
 const client=stripe();let session=await client.checkout.sessions.retrieve(order.stripe_id);if(session.payment_status==='paid'){await fulfill(session);return fail('This order is already paid.',409);}if(session.status==='open')session=await client.checkout.sessions.expire(session.id);
 if(session.status!=='expired')return fail('Payment is still processing. Refresh status before trying again.',409);
 await db().prepare("UPDATE orders SET status='expired' WHERE id=? AND status='pending'").bind(order.id).run();return json({ok:true});
 }
 if(!path.startsWith('admin/'))return fail('Not found.',404);
 const admin=await adminUser();if(!admin)return fail('Organizer access is required.',403);
 if(path==='admin/ticket-name'){
 const b=z.object({code:short,name:short}).parse(body);const updated=await db().prepare("UPDATE tickets SET attendee_name=? WHERE code=? AND checked_at IS NULL AND EXISTS(SELECT 1 FROM orders WHERE id=tickets.order_id AND status='paid')").bind(b.name,b.code).run();if(!updated.meta.changes)return fail('Only unused, confirmed passes can be updated.',409);await audit(admin.email,'attendee.updated',b.code);return json({ok:true,message:'Attendee name updated.'});
 }else if(path==='admin/test-stripe'){
 if(!env.STRIPE_SECRET_KEY)return fail('Add a Stripe secret key to the site runtime settings first.',409);
 try{const balance=await stripe().balance.retrieve();const checkedAt=Date.now();await db().prepare("INSERT INTO settings (key,value) VALUES ('stripe_verification',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify({checkedAt,fingerprint:await keyFingerprint(),mode:balance.livemode?'live':'test'})).run();await audit(admin.email,'stripe.connection_verified',balance.livemode?'live':'test');return json({ok:true,message:`Stripe ${balance.livemode?'live':'test'} connection verified. No payment was made.`});}catch{return fail('Stripe could not verify this key. Check its permissions and mode, then redeploy.',502);}
 }else if(path==='admin/undo-checkin'){
 const b=z.object({code:short,confirm:z.literal(true)}).parse(body);const updated=await db().prepare("UPDATE tickets SET checked_at=NULL,checked_by=NULL WHERE code=? AND checked_at IS NOT NULL AND EXISTS(SELECT 1 FROM orders WHERE id=tickets.order_id AND status='paid')").bind(b.code).run();if(!updated.meta.changes)return fail('No checked-in, valid ticket found.',409);await audit(admin.email,'checkin.reversed',b.code);return json({ok:true,message:'Check-in reversed. This pass can be admitted again.'});
 }else if(path==='admin/cancel-free'){
 const b=z.object({id:short,confirm:z.literal(true)}).parse(body);const updated=await db().prepare("UPDATE orders SET status='cancelled' WHERE id=? AND amount=0 AND status='paid' AND NOT EXISTS(SELECT 1 FROM tickets WHERE order_id=orders.id AND checked_at IS NOT NULL)").bind(b.id).run();if(!updated.meta.changes)return fail('Only unused free registrations can be cancelled.',409);await audit(admin.email,'registration.cancelled',b.id);return json({ok:true,message:'Free registration cancelled. The passes are invalid and capacity has been released.'});
 }else if(path==='admin/settings'){
 const b=eventSchema.parse(body);if(b.salesOpen&&(!b.date||!b.address||!b.legalAddress||!b.legalPhone||b.refundPolicy===defaultPolicy||!b.refundPolicy))return fail('Before opening sales, add a confirmed date, venue address, business address, phone number, and refund policy.');
 await db().prepare('UPDATE settings SET value=? WHERE key=?').bind(JSON.stringify(b),'event').run();
 }else if(path==='admin/ticket-type'){
 const b=typeSchema.parse(body);const allocated=await db().prepare("SELECT COALESCE(SUM(quantity),0) n FROM orders WHERE type_id=? AND status IN ('paid','pending','refund_pending')").bind(b.id).first<{n:number}>();if(b.capacity<(allocated?.n||0))return fail('Capacity cannot be less than paid tickets plus checkout holds.');
 const changed=await db().prepare(`INSERT INTO ticket_types (id,name,price,capacity,description,features,active,sort) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,price=excluded.price,capacity=excluded.capacity,description=excluded.description,features=excluded.features,active=excluded.active,sort=excluded.sort WHERE excluded.capacity >= COALESCE((SELECT SUM(quantity) FROM orders WHERE type_id=excluded.id AND status IN ('paid','pending','refund_pending')),0)`).bind(b.id,b.name,b.price,b.capacity,b.description,JSON.stringify(b.features),Number(b.active),b.sort).run();if(!changed.meta.changes)return fail('Capacity changed during checkout. Refresh and try again.',409);
 }else if(path==='admin/session'){
 const b=sessionSchema.parse(body);await db().prepare('INSERT INTO sessions (id,start,end,title,category,stage,description,speaker,sort) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET start=excluded.start,end=excluded.end,title=excluded.title,category=excluded.category,stage=excluded.stage,description=excluded.description,speaker=excluded.speaker,sort=excluded.sort').bind(b.id,b.start,b.end,b.title,b.category,b.stage,b.description,b.speaker,b.sort).run();
 }else if(path==='admin/speaker'){
 const b=speakerSchema.parse(body);await db().prepare('INSERT INTO speakers (id,name,role,organization,bio,photo_url,link_url,track,kind,published,sort) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,organization=excluded.organization,bio=excluded.bio,photo_url=excluded.photo_url,link_url=excluded.link_url,track=excluded.track,kind=excluded.kind,published=excluded.published,sort=excluded.sort').bind(b.id,b.name,b.role,b.organization,b.bio,b.photo_url,b.link_url,b.track,b.kind,Number(b.published),b.sort).run();
 }else if(path==='admin/delete-speaker'){
 const b=z.object({id:short}).parse(body);await db().prepare('DELETE FROM speakers WHERE id=?').bind(b.id).run();
 }else if(path==='admin/delete-session'){
 const b=z.object({id:short}).parse(body);await db().prepare('DELETE FROM sessions WHERE id=?').bind(b.id).run();
 }else if(path==='admin/checkin'){
 const b=z.object({code:z.string().trim().min(4).max(100)}).parse(body);const code=b.code.toUpperCase();const ticket=await db().prepare("SELECT t.*,COALESCE(NULLIF(t.attendee_name,''),o.name) AS name,o.status,o.amount,o.livemode,tt.name AS ticket_name FROM tickets t JOIN orders o ON o.id=t.order_id JOIN ticket_types tt ON tt.id=o.type_id WHERE t.code=?").bind(code).first<{checked_at:number|null;name:string;status:string;ticket_name:string;amount:number;livemode:number}>();if(!ticket||ticket.status!=='paid')return fail('No valid ticket found.',404);if(ticket.amount>0&&!ticket.livemode)return fail('Test payments cannot be used for event check-in.',409);if(ticket.checked_at)return fail('This ticket has already been checked in.',409);
 const updated=await db().prepare("UPDATE tickets SET checked_at=?,checked_by=? WHERE code=? AND checked_at IS NULL AND EXISTS(SELECT 1 FROM orders WHERE id=tickets.order_id AND status='paid' AND (amount=0 OR livemode=1))").bind(Date.now(),admin.userId,code).run();if(!updated.meta.changes)return fail('This ticket has already been checked in.',409);await audit(admin.email,'checkin.confirmed',code);return json({ok:true,message:`${ticket.name} · ${ticket.ticket_name} checked in.`});
 }else if(path==='admin/inquiry-status'){
 const b=z.object({id:short,status:z.enum(['new','reviewed','contacted','accepted','declined'])}).parse(body);await db().prepare('UPDATE inquiries SET status=? WHERE id=?').bind(b.status,b.id).run();
 }else if(path==='admin/sync'){
 if(!env.STRIPE_SECRET_KEY)return fail('Connect Stripe first.');const pending=await db().prepare("SELECT * FROM orders WHERE status IN ('pending','refund_pending') ORDER BY created_at ASC LIMIT 50").all<Order>();let synced=0,failed=0;for(const order of pending.results){try{await syncOrder(order);synced++;}catch{failed++;}}await audit(admin.email,'payments.reconciled',String(synced));return json({ok:true,message:`Checked ${synced} orders.${failed?` ${failed} could not be reached; retry reconciliation.`:''}${pending.results.length===50?' Run again to check remaining orders.':''}`});
 }else if(path==='admin/refund'){
 const b=z.object({id:short,confirm:z.literal(true)}).parse(body);const order=await db().prepare('SELECT * FROM orders WHERE id=?').bind(b.id).first<Order>();if(!order||!['paid','refund_pending'].includes(order.status)||!order.payment_intent)return fail('Only paid Stripe orders can be refunded.');
 if(order.refund_status==='failed'||order.refund_status==='canceled')return fail('The previous refund failed. Resolve it in Stripe, then reconcile the order.',409);
 const claim=await db().prepare("UPDATE orders SET status='refund_pending' WHERE id=? AND status='paid'").bind(order.id).run();
 if(!claim.meta.changes){await syncRefund(order);return json({ok:true,message:'A refund is already in progress. Its latest status has been checked.'});}
 try{const refund=await stripe().refunds.create({payment_intent:order.payment_intent,metadata:{order_id:order.id}},{idempotencyKey:'refund-'+order.id});await db().prepare("UPDATE orders SET refund_id=?,refund_status=?,status=CASE WHEN ?='succeeded' THEN 'refunded' WHEN ? IN ('failed','canceled') THEN 'paid' ELSE 'refund_pending' END,refunded_amount=CASE WHEN ?='succeeded' THEN amount ELSE refunded_amount END WHERE id=?").bind(refund.id,refund.status||'pending',refund.status,refund.status,refund.status,order.id).run();await audit(admin.email,'refund.requested',order.id);return json({ok:true,message:refund.status==='succeeded'?'Refund confirmed. All passes in this order are invalid.':'Refund submitted. Passes remain suspended until Stripe confirms the outcome.'});}catch(e){if(e instanceof Stripe.errors.StripeInvalidRequestError||e instanceof Stripe.errors.StripeAuthenticationError)await db().prepare("UPDATE orders SET status='paid' WHERE id=? AND status='refund_pending'").bind(order.id).run();return fail('Stripe has not confirmed the refund. Reconcile payments before retrying.',502);}
 }else return fail('Not found.',404);
 await audit(admin.email,path.slice(6),String(body.id||body.code||'event'));return json({ok:true});
}catch(e){if(e instanceof z.ZodError)return fail(e.issues[0]?.message||'Please check your input.');console.error('POST failed',e instanceof Error?e.message:'Unknown');return fail('The request could not be completed. Please try again.',500);}}
const defaultPolicy='Ticket sales have not opened. The refund and cancellation policy will be published before checkout becomes available.';
async function webhook(req:Request){
if(!env.STRIPE_WEBHOOK_SECRET||!env.STRIPE_SECRET_KEY)return fail('Payments unavailable.',503);
const raw=await req.text();if(raw.length>1000000)return fail('Request too large.',413);
let event:Stripe.Event;try{event=await stripe().webhooks.constructEventAsync(raw,req.headers.get('stripe-signature')||'',env.STRIPE_WEBHOOK_SECRET,undefined,Stripe.createSubtleCryptoProvider());}catch{return fail('Invalid signature.',400);}
try{
 await ensureSeed();
 const existing=await db().prepare('SELECT status FROM payment_events WHERE id=?').bind(event.id).first<{status:string}>();if(existing?.status==='processed')return json({received:true});
 await db().prepare("INSERT OR IGNORE INTO payment_events (id,type,livemode,status,received_at) VALUES (?,?,?,'processing',?)").bind(event.id,event.type,Number(event.livemode),Date.now()).run();
 if(event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded'){
  const session=await stripe().checkout.sessions.retrieve((event.data.object as Stripe.Checkout.Session).id);await fulfill(session);
 }else if(event.type==='checkout.session.expired'||event.type==='checkout.session.async_payment_failed'){
  const session=event.data.object as Stripe.Checkout.Session;await db().prepare("UPDATE orders SET status='expired' WHERE stripe_id=? AND status='pending' AND livemode=?").bind(session.id,Number(session.livemode)).run();
 }else if(event.type==='charge.refunded'){
  await applyCharge(await stripe().charges.retrieve((event.data.object as Stripe.Charge).id));
 }else if(event.type==='refund.updated'||event.type==='refund.failed'){
  const refund=event.data.object as Stripe.Refund;const intent=typeof refund.payment_intent==='string'?refund.payment_intent:refund.payment_intent?.id;
  if(intent){const order=await db().prepare('SELECT * FROM orders WHERE payment_intent=? AND livemode=?').bind(intent,Number(event.livemode)).first<Order>();if(order){await db().prepare("UPDATE orders SET refund_id=COALESCE(refund_id,?) WHERE id=? AND status='refund_pending'").bind(refund.id,order.id).run();await syncRefund({...order,refund_id:order.refund_id||refund.id});}}
 }
 await db().prepare("UPDATE payment_events SET status='processed',processed_at=? WHERE id=?").bind(Date.now(),event.id).run();return json({received:true});
}catch(e){await db().prepare("UPDATE payment_events SET status='failed' WHERE id=?").bind(event.id).run();console.error('Webhook processing failed',e instanceof Error?e.name:'Unknown');return fail('Processing failed.',500);}}
