'use client';
import {createContext,useContext,useEffect,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import {Pause,Play} from 'lucide-react';
const MotionContext=createContext({paused:false,reduced:false,toggle:()=>{}});
const revealSelector='.reveal,.topics-grid article,.narrative-grid article,.agenda-row,.ticket-card,.speaker-card,.speaker-placeholder,.path-card,.exhibit-zone';
const ambientSelector='.animated-skyline,.sun-dial,.signal-ribbon,.zone-symbol,.spin-star,.finale-asterisk';

export function MotionControl(){
 const {paused,reduced,toggle}=useContext(MotionContext);
 return <button className="motion-toggle" onClick={toggle} disabled={reduced} aria-pressed={paused} aria-label={reduced?'Decorative motion follows your device’s reduced motion setting':paused?'Enable decorative motion':'Pause decorative motion'} title={reduced?'Reduced motion is enabled on your device':undefined}>{paused?<Play size={10}/>:<Pause size={10}/>}<span>Motion {paused?'off':'on'}</span></button>;
}

export function MotionFrame({children,page}:{children:ReactNode;page:string}){
 const ref=useRef<HTMLDivElement>(null);
 const [preference,setPreference]=useState({paused:false,reduced:false});
 useEffect(()=>{
  const mq=window.matchMedia('(prefers-reduced-motion: reduce)');
  const sync=()=>{
   let stored:string|null=null;
   try{stored=localStorage.getItem('tas-motion');}catch{}
   const paused=mq.matches||stored==='paused';
   document.documentElement.classList.toggle('motion-paused',paused);
   setPreference(previous=>previous.paused===paused&&previous.reduced===mq.matches?previous:{paused,reduced:mq.matches});
  };
  const storage=(event:StorageEvent)=>{if(event.key==='tas-motion'||event.key===null)sync();};
  sync();
  mq.addEventListener('change',sync);
  window.addEventListener('storage',storage);
  return()=>{mq.removeEventListener('change',sync);window.removeEventListener('storage',storage);};
 },[]);
 function toggle(){
  if(preference.reduced)return;
  const paused=!preference.paused;
  document.documentElement.classList.toggle('motion-paused',paused);
  setPreference({...preference,paused});
  try{localStorage.setItem('tas-motion',paused?'paused':'on');}catch{}
 }
 useEffect(()=>{
  const root=ref.current;
  if(!root)return;
  const paused=preference.paused||document.documentElement.classList.contains('motion-paused');
  const pending=new Set<HTMLElement>();
  const registered=new WeakSet<HTMLElement>();
  const revealObserver=!paused&&typeof IntersectionObserver!=='undefined'?new IntersectionObserver(entries=>{
   for(const entry of entries){
    if(!entry.isIntersecting)continue;
    const node=entry.target as HTMLElement;
    node.classList.add('is-visible');
    pending.delete(node);
    revealObserver?.unobserve(node);
   }
  },{threshold:0,rootMargin:'0px 0px -16px 0px'}):null;
  const ambientObserver=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(entries=>{
   for(const entry of entries)(entry.target as HTMLElement).dataset.motionVisible=String(entry.isIntersecting);
  },{rootMargin:'80px 0px'}):null;
  function register(scope:Element){
   const revealNodes=[...(scope.matches(revealSelector)?[scope]:[]),...scope.querySelectorAll<HTMLElement>(revealSelector)];
   // Read positions together, before applying any styles. Never hide content
   // that was already visible during server rendering or a restored scroll.
   const candidates=revealNodes.filter((node):node is HTMLElement=>node instanceof HTMLElement&&!registered.has(node));
   const viewportHeight=window.innerHeight;
   const positions=candidates.map(node=>node.getBoundingClientRect());
   candidates.forEach((node,index)=>{
    registered.add(node);
    if(node.parentElement?.closest('.reveal-observed'))return;
    const bounds=positions[index];
    if(!revealObserver||bounds.top<viewportHeight||bounds.height===0){node.classList.add('is-visible');return;}
    const siblings=node.parentElement?.children;
    const order=siblings?Array.prototype.indexOf.call(siblings,node):0;
    node.style.setProperty('--reveal-delay',`${Math.min(order%3,2)*45}ms`);
    node.classList.add('reveal-observed');
    pending.add(node);
    revealObserver.observe(node);
   });
   const ambientNodes=[...(scope.matches(ambientSelector)?[scope]:[]),...scope.querySelectorAll<HTMLElement>(ambientSelector)];
   for(const node of ambientNodes)ambientObserver?.observe(node);
  }
  register(root);
  // Filters and showcase tabs can insert content after the first render.
  const mutations=new MutationObserver(records=>{
   for(const record of records){
    for(const node of record.removedNodes)if(node instanceof HTMLElement){
     for(const item of [node,...node.querySelectorAll<HTMLElement>('.reveal-observed,[data-motion-visible]')]){
      revealObserver?.unobserve(item);ambientObserver?.unobserve(item);pending.delete(item);
     }
    }
    for(const node of record.addedNodes)if(node instanceof HTMLElement)register(node);
   }
  });
  mutations.observe(root,{childList:true,subtree:true});
  return()=>{
   revealObserver?.disconnect();ambientObserver?.disconnect();mutations.disconnect();
   for(const node of pending)node.classList.add('is-visible');
  };
 },[page,preference.paused]);
 useEffect(()=>{
  const root=ref.current;
  if(!root)return;
  const progress=root.querySelector<HTMLElement>('.reading-progress');
  let frame=0,maxScroll=0;
  const update=()=>{
   frame=0;
   progress?.style.setProperty('transform',`scaleX(${maxScroll>0?Math.max(0,Math.min(1,window.scrollY/maxScroll)):0})`);
  };
  const schedule=()=>{if(!frame&&!document.hidden)frame=requestAnimationFrame(update);};
  const measure=()=>{maxScroll=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);schedule();};
  const visibility=()=>{
   root.dataset.pageInactive=String(document.hidden);
   if(document.hidden){cancelAnimationFrame(frame);frame=0;}else measure();
  };
  const resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(measure):null;
  resize?.observe(root);
  window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',measure,{passive:true});
  document.addEventListener('visibilitychange',visibility);
  visibility();
  return()=>{resize?.disconnect();cancelAnimationFrame(frame);window.removeEventListener('scroll',schedule);window.removeEventListener('resize',measure);document.removeEventListener('visibilitychange',visibility);};
 },[page]);
 return <MotionContext.Provider value={{...preference,toggle}}><div ref={ref} className={'event-experience page-'+page}><div className="reading-progress" aria-hidden="true"/>{children}</div></MotionContext.Provider>;
}

export function Skyline(){
 const ref=useRef<HTMLDivElement>(null);
 const {paused}=useContext(MotionContext);
 useEffect(()=>{
  const node=ref.current;
  if(!node)return;
  const reset=()=>{node.style.setProperty('--sky-x','0px');node.style.setProperty('--sky-y','0px');};
  reset();
  const pointer=window.matchMedia('(hover: hover) and (pointer: fine)');
  if(paused||!pointer.matches||document.documentElement.classList.contains('motion-paused'))return;
  const hero=node.parentElement!;
  let frame=0,x=0,y=0,targetX=0,targetY=0,lastTime=0,bounds:DOMRect|null=null;
  const tick=(time:number)=>{
   const ease=1-Math.exp(-Math.min(time-lastTime||16,50)/90);
   lastTime=time;
   x+=(targetX-x)*ease;y+=(targetY-y)*ease;
   node.style.setProperty('--sky-x',`${x.toFixed(2)}px`);node.style.setProperty('--sky-y',`${y.toFixed(2)}px`);
   if(Math.abs(targetX-x)+Math.abs(targetY-y)>.025)frame=requestAnimationFrame(tick);
   else{frame=0;lastTime=0;node.style.removeProperty('will-change');}
  };
  const schedule=()=>{if(!frame&&!document.hidden){node.style.willChange='transform';frame=requestAnimationFrame(tick);}};
  const move=(event:PointerEvent)=>{
   if(event.pointerType==='touch')return;
   bounds??=hero.getBoundingClientRect();
   if(!bounds.width||!bounds.height)return;
   targetX=((event.clientX-bounds.left)/bounds.width-.5)*10;
   targetY=((event.clientY-bounds.top)/bounds.height-.5)*6;
   schedule();
  };
  const leave=()=>{targetX=0;targetY=0;bounds=null;schedule();};
  const invalidate=()=>{bounds=null;};
  const visibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;lastTime=0;x=0;y=0;targetX=0;targetY=0;reset();node.style.removeProperty('will-change');}};
  hero.addEventListener('pointermove',move,{passive:true});hero.addEventListener('pointerleave',leave);
  window.addEventListener('resize',invalidate,{passive:true});window.addEventListener('scroll',invalidate,{passive:true});document.addEventListener('visibilitychange',visibility);
  return()=>{hero.removeEventListener('pointermove',move);hero.removeEventListener('pointerleave',leave);window.removeEventListener('resize',invalidate);window.removeEventListener('scroll',invalidate);document.removeEventListener('visibilitychange',visibility);cancelAnimationFrame(frame);node.style.removeProperty('will-change');reset();};
 },[paused]);
 return <div ref={ref} className="hero-art animated-skyline" aria-hidden="true"><svg viewBox="680 25 856 760" preserveAspectRatio="xMaxYMid meet"><image href="/tokyo-reference.jpeg" x="0" y="0" width="1536" height="864"/></svg><span className="sky-scan"/><span className="sky-point point-one"/><span className="sky-point point-two"/></div>;
}
export function SignalRibbon(){const items=['GLOBAL 2026','JAPAN 2026','FROM MODELS TO THE REAL WORLD','2027 OUTLOOK'];return <div className="signal-ribbon"><span className="signal-label">THE YEAR IN AI <i className="red-dot"/></span><div className="signal-window"><div className="signal-track">{[0,1,2].map(i=><div className="signal-group" key={i} aria-hidden={i>0}>{items.map(item=><span key={item}>{item}<b>✳</b></span>)}</div>)}</div></div></div>}
export function SunDial({word='東京',variant='sun'}:{word?:string;variant?:string}){return <div className={'sun-dial dial-variant-'+variant} aria-hidden="true"><div className="dial-grid"/><div className="dial-ring outer"/><div className="dial-ring inner"/><div className="dial-core"><span>{word}</span></div><div className="dial-orbit"><i/></div><span className="dial-cross cross-a">+</span><span className="dial-cross cross-b">+</span><span className="dial-coordinates">35.6762° N<br/>139.6503° E</span><span className="dial-caption">INTELLIGENCE<br/>IN MOTION.</span><div className="dial-wave">{Array.from({length:25},(_,i)=><i key={i} style={{'--bar-height':`${14+Math.sin(i*.7)**2*44}px`,'--bar-delay':`${i*-.09}s`} as CSSProperties}/>)}</div></div>}
export function SpeakerGlyph({index=0}:{index?:number}){return <div className={'speaker-glyph glyph-'+index%4} aria-hidden="true"><div className="glyph-grid"/><i className="glyph-shape shape-a"/><i className="glyph-shape shape-b"/><i className="glyph-shape shape-c"/><span className="glyph-coordinate">VOICE / 0{index+1}</span><span className="glyph-plus">+</span></div>}
