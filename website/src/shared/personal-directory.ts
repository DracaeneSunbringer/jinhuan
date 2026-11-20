
export const OWNER52_TITLE_ID = 'owner-52di'
export const OWNER52B_TITLE_ID = 'owner-52b'
export type PersonalTitle = { name:string; mood:string; rarity?:'normal'|'SSR'; art?:'v2'; ownerOnly?:boolean }
export const PERSONAL_TITLES:Readonly<Record<string,PersonalTitle>>={}
export const personalTitleId=(v:unknown):string|null=>typeof v==='string'&&Object.hasOwn(PERSONAL_TITLES,v)?v:null
