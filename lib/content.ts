export type EventSettings = {
  title: string; year: string; theme: string; tagline: string; date: string; dateLabel: string;
  venue: string; address: string; time: string; salesOpen: boolean; contactEmail: string;
  refundPolicy: string; announcement: string; legalName: string; legalAddress: string; legalPhone: string;
};
export type TicketType = {id:string; name:string; price:number; capacity:number; description:string; features:string; active:number; sort:number; sold?:number; reserved?:number};
export type Session = {id:string; start:string; end:string; title:string; category:string; stage:string; description:string; speaker:string; sort:number};
export const defaultEvent: EventSettings = {
  title:'Tokyo AI Summit', year:'2026', theme:'AI 2026: From Models to the Real World',
  tagline:'What changed. What Japan built. What comes next.', date:'', dateLabel:'Year-end 2026 · Date to be announced',
  venue:'Tokyo, Japan', address:'Venue announcement coming soon', time:'09:00–17:00 JST', salesOpen:false,
  contactEmail:'cognisor.ai@gmail.com', refundPolicy:'Ticket sales have not opened. The refund and cancellation policy will be published before checkout becomes available.',
  announcement:'A year of breakthroughs. A day to connect the dots.',legalName:'Cognisor AI',legalAddress:'',legalPhone:''
};
export const defaultTickets:TicketType[] = [
  {id:'explorer',name:'Explorer',price:0,capacity:300,description:'Your introduction to the year in AI.',features:JSON.stringify(['2026 AI Showcase access','Startup & product demonstrations','Community networking']),active:1,sort:0},
  {id:'summit',name:'Summit Pass',price:5000,capacity:200,description:'The full summit experience.',features:JSON.stringify(['All keynotes & fireside conversations','2026 AI Showcase access','Japan AI 2026 sessions','Community networking']),active:1,sort:1},
  {id:'ecosystem',name:'Ecosystem Pass',price:12000,capacity:50,description:'Go deeper. Make meaningful connections.',features:JSON.stringify(['Everything in the Summit Pass','Curated networking session','Priority main-stage seating','Partner & founder introductions']),active:1,sort:2}
];
export const defaultSessions:Session[] = [
  {id:'opening',start:'09:00',end:'09:45',title:'Opening & partner perspectives',category:'Main stage',stage:'Main stage',description:'Our sponsors open the day with perspectives on the technologies and ideas shaping the next chapter of AI.',speaker:'Speakers to be announced',sort:0},
  {id:'global',start:'09:45',end:'10:45',title:'The year in AI: what actually changed?',category:'Global 2026',stage:'Main stage',description:'A curated retrospective on agents, multimodal models, coding, infrastructure and the move from benchmarks to useful systems.',speaker:'Speakers to be announced',sort:1},
  {id:'japan',start:'10:45',end:'12:00',title:'Japan AI 2026: from adoption to ambition',category:'Japan 2026',stage:'Main stage',description:'Enterprise adoption, research, government, startups and physical AI — examined from Japan.',speaker:'Speakers to be announced',sort:2},
  {id:'lunch',start:'12:00',end:'13:00',title:'Lunch & open connections',category:'Networking',stage:'Community area',description:'A pause to exchange ideas and meet the people building across the ecosystem. Lunch arrangements to be confirmed.',speaker:'All attendees',sort:3},
  {id:'showcase',start:'13:00',end:'17:00',title:'2026 AI Showcase',category:'Showcase',stage:'Exhibition floor',description:'An afternoon of products and demonstrations across agents, robotics, voice, creative AI, developer tools and infrastructure.',speaker:'Exhibitors to be announced',sort:4},
  {id:'realworld',start:'13:00',end:'14:30',title:'From models to the real world',category:'Main stage',stage:'Main stage',description:'Keynotes and fireside conversations on making AI useful in real organizations and daily life.',speaker:'Speakers to be announced',sort:5},
  {id:'physical',start:'14:30',end:'15:45',title:'Intelligence meets the physical world',category:'Japan 2026',stage:'Main stage',description:'Robotics, manufacturing and human-machine collaboration through a Japanese lens.',speaker:'Speakers to be announced',sort:6},
  {id:'outlook',start:'15:45',end:'17:00',title:'2027: the questions that come next',category:'2027 Outlook',stage:'Main stage',description:'What should we build, measure and prepare for? Closing conversations that turn a year in review into a shared agenda.',speaker:'Speakers to be announced',sort:7}
];
export const topics = [
  {n:'01',name:'Autonomous agents',sub:'From answers to action',text:'Explore how AI systems can plan, use tools and carry work across multiple steps.',icon:'agent'},
  {n:'02',name:'Enterprise AI',sub:'Beyond the pilot',text:'Connecting intelligence to the data, systems and people inside real organizations.',icon:'enterprise'},
  {n:'03',name:'Physical AI',sub:'Intelligence in motion',text:'Robotics, manufacturing and a world where AI can sense, reason and act.',icon:'robot'},
  {n:'04',name:'Multimodal AI',sub:'More ways to understand',text:'Voice, vision, video and language coming together in new experiences.',icon:'voice'},
  {n:'05',name:'Code & cybersecurity',sub:'Build better. Build safely.',text:'AI for software engineering, resilient systems and the next generation of developers.',icon:'code'},
  {n:'06',name:'AI everywhere',sub:'Closer to everyday life',text:'Personal assistants, devices and local intelligence that meet people where they are.',icon:'device'},
  {n:'07',name:'AI infrastructure',sub:'The foundations of scale',text:'Compute, chips, efficiency and the economics behind intelligence at scale.',icon:'chip'},
  {n:'08',name:'Governance & society',sub:'Progress with perspective',text:'Trust, work, human agency and how we shape the technologies we choose to adopt.',icon:'society'}
];
export const money=(n:number)=>new Intl.NumberFormat('en-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(n);
export type Speaker={id:string;name:string;role:string;organization:string;bio:string;photo_url:string;link_url:string;track:string;kind:string;published:number;sort:number};
export const eventPages=['home','about','program','speakers','showcase','partners','attend'] as const;
export type EventPage=typeof eventPages[number];
