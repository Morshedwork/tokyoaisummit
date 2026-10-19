import {getChatGPTUser,chatGPTSignInPath} from '../chatgpt-auth';
import {getEvent,orderTickets} from '@/lib/server';
import {Brand} from '../components/shared';
import MyTickets,{type TicketsData} from '../components/MyTickets';
export const dynamic='force-dynamic';
export default async function TicketsPage(){const user=await getChatGPTUser();if(!user)return <div className="auth-gate"><Brand/><h1>Your summit, in your pocket.</h1><p>Sign in with the account you used to register to see your passes, payment status and check-in codes.</p><a href={chatGPTSignInPath('/tickets')} target="_top" className="button red-button">Sign in to see your tickets ↗</a><a href="/" className="text-link">← Back to the summit</a></div>;const [initial,event]=await Promise.all([orderTickets(user.userId),getEvent()]);return <MyTickets initial={initial as unknown as TicketsData} event={event} name={user.displayName}/>}
