import {notFound} from 'next/navigation';
import {type Metadata} from 'next';
import Summit from '../components/Summit';
import {getPublic,adminUser} from '@/lib/server';
import {eventPages,type EventPage} from '@/lib/content';
import {getChatGPTUser} from '../chatgpt-auth';
export const dynamic='force-dynamic';
const titles:Record<string,string>={about:'The Summit',program:'The Program',speakers:'Speakers',showcase:'2026 AI Showcase',partners:'Partnerships',attend:'Tickets & Plan Your Visit'};
export async function generateMetadata({params}:{params:Promise<{section:string}>}):Promise<Metadata>{const {section}=await params;return {title:(titles[section]||'Page')+' — Tokyo AI Summit 2026'};}
export default async function EventSection({params}:{params:Promise<{section:string}>}){const {section}=await params;if(section==='home'||!eventPages.includes(section as EventPage))notFound();const [data,user,admin]=await Promise.all([getPublic(),getChatGPTUser(),adminUser()]);return <Summit key={section} page={section as EventPage} data={data} user={user?{name:user.displayName,email:user.email}:null} isAdmin={!!admin}/>}
