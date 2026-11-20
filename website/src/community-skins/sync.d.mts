export function readCommunityCatalog(bucket:R2Bucket):Promise<{source:string;entries:Array<{id:string;name:string;author:string;components:{bubble?:unknown}}> }>
