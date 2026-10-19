import Summit from './components/Summit';
import {adminUser,getPublic} from '@/lib/server';
import {getChatGPTUser} from './chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Home(){const [data,user,admin]=await Promise.all([getPublic(),getChatGPTUser(),adminUser()]);return <Summit data={data} user={user?{name:user.displayName,email:user.email}:null} isAdmin={!!admin}/>}
