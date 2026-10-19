'use client';
import Link from 'next/link';
import {ArrowUpRight,ArrowRight,Check,LoaderCircle,X} from 'lucide-react';
import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
export function Mark(){return <svg viewBox="0 0 32 32" width="32" height="32" fill="none" aria-hidden="true"><path d="M26 11a11 11 0 1 0-10 16v-9h11v9" stroke="currentColor" strokeWidth="7" strokeLinejoin="round"/></svg>}
export function Brand({light=false}:{light?:boolean}){return <Link className={'brand '+(light?'light':'')} href="/" aria-label="Tokyo AI Summit home"><Mark/><span>Cognisor AI<span className="brand-caption">TOKYO AI SUMMIT</span></span></Link>}
export function Arrow({up=false}:{up?:boolean}){return up?<ArrowUpRight size={19}/>:<ArrowRight size={19}/>}
export function Modal({title,eyebrow,children,onClose,wide=false}:{title:string;eyebrow?:string;children:ReactNode;onClose:()=>void;wide?:boolean}){
 const ref=useRef<HTMLDialogElement>(null),titleId=useId();
 const [closing,setClosing]=useState(false);
 const closeRef=useRef(onClose);
 useEffect(()=>{closeRef.current=onClose;},[onClose]);
 useEffect(()=>{
  const dialog=ref.current;
  const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  if(dialog&&!dialog.open)dialog.showModal();
  const old=document.body.style.overflow;
  document.body.style.overflow='hidden';
  return()=>{document.body.style.overflow=old;dialog?.close();if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});};
 },[]);
 useEffect(()=>{
  if(!closing)return;
  const timer=window.setTimeout(()=>closeRef.current(),180);
  return()=>window.clearTimeout(timer);
 },[closing]);
 function requestClose(){
  if(closing)return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.classList.contains('motion-paused'))closeRef.current();
  else setClosing(true);
 }
 return <dialog className={'modal '+(wide?'wide ':'')+(closing?'is-closing':'')} ref={ref} aria-labelledby={titleId} aria-modal="true" onCancel={e=>{e.preventDefault();requestClose();}} onClick={e=>{if(e.target===e.currentTarget)requestClose();}}><div className="modal-content"><button type="button" className="icon-btn close" onClick={requestClose} aria-label="Close dialog"><X/></button>{eyebrow&&<p className="eyebrow red">{eyebrow}</p>}<h2 id={titleId}>{title}</h2>{children}</div></dialog>;
}
export function Spinner(){return <LoaderCircle size={18} className="spin"/>}
export function Success({title,children}:{title:string;children:ReactNode}){return <div className="success"><div className="success-icon"><Check size={30}/></div><h3>{title}</h3><p>{children}</p></div>}
export async function api<T = any>(path:string,body?:unknown):Promise<T>{const r=await fetch('/api/'+path,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json() as T & {error?:string};if(!r.ok)throw new Error(data.error||'Something went wrong. Please try again.');return data;}
