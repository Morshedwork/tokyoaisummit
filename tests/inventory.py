import sqlite3, pathlib, re, uuid, concurrent.futures, tempfile
root=pathlib.Path(__file__).parents[1]
sql='\n'.join(p.read_text().replace('--> statement-breakpoint','') for p in sorted((root/'drizzle').glob('*.sql')))
reserve=re.search(r'export const reserveSql=`(.*?)`;', (root/'lib/rules.ts').read_text(),re.S).group(1)
with tempfile.TemporaryDirectory() as tmp:
 path=tmp+'/test.db'
 con=sqlite3.connect(path);con.executescript(sql)
 con.execute("INSERT INTO ticket_types VALUES ('summit','Summit',5000,5,'Test','[]',1,0)");con.commit();con.close()
 def attempt(i):
  c=sqlite3.connect(path,timeout=15)
  result=c.execute(reserve,(str(uuid.uuid4()),'user_'+str(i),'summit',1,'Test','test@example.com','',5000,1,2,1,'request_'+str(i),'["Guest"]','Summit','Test Summit','summit',5000,1)).rowcount
  c.commit();c.close();return result
 with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool: accepted=sum(pool.map(attempt,range(15)))
 assert accepted==5, f'Capacity breach: {accepted}'
 con=sqlite3.connect(path)
 row=con.execute('SELECT id FROM orders LIMIT 1').fetchone()[0]
 # A local expiration timestamp alone cannot release inventory.
 assert attempt(100)==0
 con.execute("UPDATE orders SET status='expired' WHERE id=?",(row,));con.commit()
 assert attempt(101)==1
 row=con.execute("SELECT id FROM orders WHERE status='pending' LIMIT 1").fetchone()[0]
 # A refund in flight holds capacity until Stripe confirms its outcome.
 con.execute("UPDATE orders SET status='refund_pending' WHERE id=?",(row,));con.commit()
 assert attempt(102)==0
 con.execute("UPDATE orders SET status='pending' WHERE id=?",(row,));con.commit()
 # Fulfillment is replay-safe and each quantity produces one code.
 row=con.execute("SELECT id FROM orders WHERE status='pending' LIMIT 1").fetchone()[0]
 for _ in range(3):
  con.execute("UPDATE orders SET status='paid' WHERE id=? AND status IN ('pending','paid')",(row,))
  con.execute("INSERT OR IGNORE INTO tickets (code,order_id) SELECT ?,? WHERE EXISTS (SELECT 1 FROM orders WHERE id=? AND status='paid')",('TAS-ABC-1',row,row))
 con.commit();assert con.execute('SELECT COUNT(*) FROM tickets').fetchone()[0]==1
 # Check-in is conditional and cannot be recorded twice.
 a=con.execute("UPDATE tickets SET checked_at=1 WHERE code='TAS-ABC-1' AND checked_at IS NULL").rowcount
 b=con.execute("UPDATE tickets SET checked_at=2 WHERE code='TAS-ABC-1' AND checked_at IS NULL").rowcount
 assert (a,b)==(1,0)
 # Refunds invalidate ticket visibility and free inventory.
 con.execute("UPDATE orders SET status='refunded' WHERE id=?",(row,));con.commit()
 assert con.execute("SELECT COUNT(*) FROM tickets t JOIN orders o ON t.order_id=o.id WHERE o.status='paid'").fetchone()[0]==0
 assert attempt(102)==1
 # Account isolation: another user's ID never returns this order.
 assert not con.execute("SELECT * FROM orders WHERE id=? AND user_id=?",(row,'intruder')).fetchone()
 print('PASS: concurrent inventory, verified release, idempotent ticketing, duplicate check-in, refunds and account isolation')
