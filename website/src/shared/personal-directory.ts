import { PERSONAL_TITLES as LEGACY_TITLES } from './personal-catalog'
import { PERSONAL_V2_TITLES } from './personal-v2-catalog'

export const OWNER52_TITLE_ID = 'owner-52di'
export const OWNER52B_TITLE_ID = 'owner-52b'
export type PersonalTitle = { name:string; mood:string; rarity?:'normal'|'SSR'; art?:'v2'; ownerOnly?:boolean }
export const PERSONAL_TITLES:Readonly<Record<string,PersonalTitle>>={[OWNER52_TITLE_ID]:{name:'52帝',mood:'站长专属',rarity:'SSR',ownerOnly:true},[OWNER52B_TITLE_ID]:{name:'52B',mood:'限定巡展',rarity:'SSR',ownerOnly:true},...LEGACY_TITLES,...PERSONAL_V2_TITLES}
export const personalTitleId=(v:unknown):string|null=>typeof v==='string'&&Object.hasOwn(PERSONAL_TITLES,v)?v:null
