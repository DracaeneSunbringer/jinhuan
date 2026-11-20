// 仅接收已完成引用保护、确定可删除的群附件 key。清理器负责持久化重试状态。
const GENERATED_CHAT_KEY=/^c\/\d{4}\/(?:0[1-9]|1[0-2])\/[a-f0-9]{24}\.[a-z0-9]{1,8}$/
type PurgeResponse={success?:boolean}
export async function purgeChatMediaCache(keys:string[],token:string,zoneId:string,fetcher:typeof fetch=fetch){
 const unique=[...new Set(keys)]
 if(!unique.length)return {purged:0}
 if(unique.length>10||unique.some(key=>!GENERATED_CHAT_KEY.test(key)))throw Error('附件缓存清理参数无效')
 if(!/^[a-f0-9]{32}$/.test(zoneId)||!token)throw Error('附件缓存清理配置不可用')
 // Prefix 清理覆盖同一文件的查询参数变体，并限制到该附件的两个公开域名。
 const prefixes=unique.flatMap(key=>[`jinhuan.example/img/${key}`,`img.jinhuan.example/img/${key}`])
 const response=await fetcher(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,{
  method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
  body:JSON.stringify({prefixes}),signal:AbortSignal.timeout(10000),
 })
 let result:PurgeResponse;try{result=await response.json() as PurgeResponse}catch{throw Error('附件缓存清理响应无效')}
 if(!response.ok||result.success!==true)throw Error(`附件缓存清理失败：HTTP ${response.status}`)
 return {purged:unique.length}
}
