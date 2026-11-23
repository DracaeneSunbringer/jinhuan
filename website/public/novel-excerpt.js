const HEAD=/^\[novel-excerpt:v1:([a-z0-9-]{1,80}):([1-9]\d{0,5}):(paper|white|green|night)\]\n([^\n]{1,100})\n([^\n]{1,120})\n([\s\S]{1,1600})$/
export function parseNovelExcerpt(body){
 if(typeof body!=='string'||body.length>2000)return null
 const m=HEAD.exec(body);if(!m||!m[6].trim())return null
 return {bookId:m[1],chapter:Number(m[2]),theme:m[3],title:m[4],chapterTitle:m[5],text:m[6]}
}
export function serializeNovelExcerpt(item){
 const line=(s,max)=>String(s??'').replace(/[\r\n]+/g,' ').trim().slice(0,max)
 const title=line(item.title,100),chapterTitle=line(item.chapterTitle,120),text=String(item.text??'').replace(/\r/g,'').trim()
 const result=`[novel-excerpt:v1:${item.bookId}:${item.chapter}:${item.theme}]\n${title}\n${chapterTitle}\n${text}`
 if(!parseNovelExcerpt(result))throw Error('摘录无效或超过1600字，请重新选择')
 return result
}
export function novelExcerptCard(item,h){
 if(!document.getElementById('novel-excerpt-styles')){const link=document.createElement('link');link.id='novel-excerpt-styles';link.rel='stylesheet';link.href='/novel-excerpt.css?v=472f7fbf';document.head.append(link)}
 const href=`/novels/${item.bookId}?chapter=${item.chapter}`
 return h('article',{class:'novel-excerpt','data-theme':item.theme,'aria-label':'小说摘录'},
  h('div',{class:'novel-excerpt-head'},h('span',null,'小说摘录'),h('a',{href,'data-link':'','aria-label':'阅读《'+item.title+'》原文'},'阅读原文 ↗')),
  h('strong',{class:'novel-excerpt-title'},'《'+item.title+'》'),h('span',{class:'novel-excerpt-chapter'},item.chapterTitle),
  h('div',{class:'novel-excerpt-text'},...item.text.split(/\n+/).map(x=>h('p',null,x))))
}
