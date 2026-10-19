import {adminUser} from '@/lib/server';
import {getChatGPTUser,chatGPTSignInPath} from '../chatgpt-auth';
import Admin from '../components/Admin';
import {Brand} from '../components/shared';
export const dynamic='force-dynamic';
export default async function AdminPage(){const user=await getChatGPTUser(),admin=await adminUser();if(!admin)return <div className="auth-gate"><Brand/><h1>Organizer workspace.</h1><p>{user?'This workspace is available to authorized summit organizers. Please use the organizer account.':'Sign in with the organizer account to manage registrations, the program and event details.'}</p>{!user&&<a href={chatGPTSignInPath('/admin')} target="_top" className="button red-button">Sign in to continue ↗</a>}<a href="/" className="text-link">← Back to the summit</a></div>;return <Admin user={{name:admin.displayName,email:admin.email}}/>}
