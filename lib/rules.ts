export function isAdminEmail(email:string|undefined,allowlist:string|undefined){return !!email && (allowlist||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());}
export function validOrigin(origin:string|null,expected:string){return !!origin && origin===new URL(expected).origin;}
export function csvCell(value:unknown){let text=String(value??'');if(/^[\s]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
export function paymentMatches(order:{id:string;amount:number;livemode:number;stripe_id?:string|null},session:{id:string;metadata?:{[key:string]:string}|null;currency:string|null;amount_total:number|null;payment_status:string;livemode:boolean}){
return session.metadata?.order_id===order.id && (!order.stripe_id||order.stripe_id===session.id) && session.currency==='jpy' && session.amount_total===order.amount && session.payment_status==='paid' && Number(session.livemode)===order.livemode;
}
export const reserveSql=`INSERT OR IGNORE INTO orders (id,user_id,type_id,quantity,name,email,company,status,amount,created_at,expires_at,livemode,request_key,attendee_names,ticket_label,checkout_title)
SELECT ?,?,?,?,?,?,?,'pending',?,?,?,?,?,?,?,? FROM ticket_types t WHERE t.id=? AND t.active=1 AND t.price=?
AND t.capacity >= ? + COALESCE((SELECT SUM(quantity) FROM orders WHERE type_id=t.id AND status IN ('pending','paid','refund_pending')),0)`;
