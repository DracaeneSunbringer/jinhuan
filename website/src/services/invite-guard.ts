import type {C} from '../types'
import {sha256} from '../lib/crypto'
import {fail,sameOrigin} from '../lib/http'
// Invitations support OAuth accounts independently of optional email login.
export async function inviteRateLimit(c:C){
 if(!c.env.AUTH_RL)fail(503,'邀请码服务暂时不可用')
 const user=c.get('user'),identity=user?'user:'+user.id:'ip:'+(c.req.header('cf-connecting-ip')||'local')
 const key=await sha256('invite-rate|'+identity)
 if(!(await c.env.AUTH_RL!.limit({key})).success)fail(429,'操作太频繁，请稍后重试')
}
export async function inviteWriteGuard(c:C){sameOrigin(c);await inviteRateLimit(c)}
