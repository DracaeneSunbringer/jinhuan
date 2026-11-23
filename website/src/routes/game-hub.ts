import {Hono} from 'hono'
import type {Ctx,C} from '../types'

// Browser -> same-origin main -> existing game Worker -> the one GAME_ROOMS namespace.
// Mount before main session loading: the game service authenticates the cookie through MAIN.
export const gameHub = new Hono<Ctx>()
gameHub.all('/api/game-rooms/*', forwardGame)
gameHub.all('/api/game-rooms', forwardGame)
gameHub.all('/api/game-chat/*', forwardGame)
gameHub.all('/api/game-chat', forwardGame)

async function forwardGame(c: C) {
  if(/^\/api\/game-rooms(?:\/|$)/.test(c.req.path)){c.header('cache-control','no-store');return c.json({code:'game_retired',error:'AI对抗和卧底画家已下线，请参与普通猜词。'},410)}
  const request=c.req.raw,url=new URL(request.url),origin=request.headers.get('origin')
  const match=/^\/api\/game-rooms(?:\/([a-f0-9-]{36})(\/socket)?)?$/i.exec(url.pathname)
  const chat=/^\/api\/game-chat(?:\/(\d+))?$/.exec(url.pathname)
  if(!match&&!chat)return c.json({error:'游戏接口不存在'},404)
  const socket=!!match?.[2]
  const methods=chat?(chat[1]?['PATCH','DELETE']:['GET','POST']):['GET','POST']
  if(!methods.includes(request.method)||socket&&request.method!=='GET')return c.json({error:'不支持此操作'},405)
  if(origin&&origin!==url.origin||((request.method!=='GET'||socket)&&origin!==url.origin))return c.json({error:'非法来源'},403)
  if(socket&&request.headers.get('upgrade')?.toLowerCase()!=='websocket')return c.json({error:'需要实时连接'},400)
  if(!/(?:^|;\s*)sid=[^;]+/.test(request.headers.get('cookie')||''))return c.json({error:'请先登录'},401)
  if(!c.env.GAME_HUB)return c.json({error:'游戏服务暂不可用，请稍后重试'},503)
  const headers=new Headers({origin:'https://cc.52dmeme.com'})
  for(const key of ['cookie','content-type','content-length','upgrade','sec-websocket-key','sec-websocket-version','sec-websocket-protocol','sec-websocket-extensions']){
    const value=request.headers.get(key);if(value!==null)headers.set(key,value)
  }
  const path=chat?'/api/guess-sidebar/messages'+(chat[1]?'/'+chat[1]:''):url.pathname
  const target=new URL(path+url.search,'https://cc.52dmeme.com')
  return c.env.GAME_HUB.fetch(new Request(target,new Request(request,{headers,redirect:'manual'})))
}
