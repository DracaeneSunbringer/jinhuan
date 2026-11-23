// 社区更新页：读 /api/community-updates，按分类筛选，最新的在最上面。所有文本都走 textContent。
const REPO = 'https://github.com/kourou25/jinhuan'
const KINDS = {
  feature: '新功能',
  fix: '修复',
  polish: '体验优化',
  art: '美术',
  community: '社区',
}
const $ = (id) => document.getElementById(id)
const list = $('updates')
const filters = $('filters')

const el = (tag, { dataset, ...props } = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props)
  if (dataset) Object.assign(n.dataset, dataset)
  n.append(...kids.filter((k) => k != null && k !== false))
  return n
}
const fmtDate = (d) => {
  const [y, m, day] = d.split('-').map(Number)
  return y === new Date().getFullYear() ? `${m}月${day}日` : `${y}年${m}月${day}日`
}

function card(u) {
  const kind = KINDS[u.kind] ? u.kind : ''
  const meta = el('div', { className: 'cu-meta' })
  if (u.date) meta.append(el('time', { dateTime: u.date, textContent: fmtDate(u.date) }))
  if (u.author) {
    const who = el('a', { className: 'cu-author', href: 'https://github.com/' + u.author, target: '_blank', rel: 'noopener' })
    const avatar = el('img', { src: 'https://avatars.githubusercontent.com/' + u.author + '?s=48', alt: '', width: 20, height: 20, loading: 'lazy', decoding: 'async' })
    avatar.addEventListener('error', () => avatar.remove(), { once: true })
    who.append(avatar, '@' + u.author)
    meta.append(who)
  }
  meta.append(el('a', { className: 'cu-issue', href: REPO + '/issues/' + u.issue, target: '_blank', rel: 'noopener', textContent: '需求 #' + u.issue }))

  return el('li', { className: 'cu-item', dataset: { kind: kind || 'none' } },
    el('span', { className: 'cu-node', ariaHidden: 'true' }),
    el('article', { className: 'cu-entry' },
      el('header', {},
        kind ? el('span', { className: 'cu-tag cu-tag-' + kind, textContent: KINDS[kind] }) : null,
        el('h3', { textContent: u.title })),
      el('p', { textContent: u.body }),
      meta))
}

function render(updates, active) {
  const shown = active === 'all' ? updates : updates.filter((u) => u.kind === active)
  list.replaceChildren(...shown.map(card))
  for (const b of filters.children) {
    const on = b.dataset.kind === active
    b.classList.toggle('on', on)
    b.setAttribute('aria-selected', String(on))
  }
}

function setupFilters(updates) {
  const counts = {}
  for (const u of updates) if (KINDS[u.kind]) counts[u.kind] = (counts[u.kind] || 0) + 1
  const present = Object.keys(KINDS).filter((k) => counts[k])
  if (!present.length) return 'all'
  const make = (kind, label, n) => el('button', { type: 'button', className: 'seg', role: 'tab', dataset: { kind } }, label, el('small', { textContent: String(n) }))
  filters.replaceChildren(make('all', '全部', updates.length), ...present.map((k) => make(k, KINDS[k], counts[k])))
  filters.hidden = false
  const fromUrl = new URLSearchParams(location.search).get('kind')
  const active = present.includes(fromUrl) ? fromUrl : 'all'
  filters.addEventListener('click', (e) => {
    const b = e.target.closest('.seg')
    if (!b) return
    const url = new URL(location.href)
    if (b.dataset.kind === 'all') url.searchParams.delete('kind'); else url.searchParams.set('kind', b.dataset.kind)
    history.replaceState(null, '', url)
    render(updates, b.dataset.kind)
  })
  return active
}

function stats(updates) {
  const people = new Set(updates.map((u) => u.author?.toLowerCase()).filter(Boolean))
  const dates = updates.map((u) => u.date).filter(Boolean).sort()
  $('stat-count').textContent = updates.length + ' 条'
  $('stat-people').textContent = people.size ? people.size + ' 位' : '—'
  $('stat-latest').textContent = dates.length ? fmtDate(dates.at(-1)) : '—'
  $('stats').hidden = false
}

function failed() {
  const retry = el('button', { type: 'button', className: 'btn btn-ghost sm', textContent: '重新读取' })
  retry.addEventListener('click', () => location.reload())
  list.replaceChildren(el('li', { className: 'cu-empty' }, el('p', { textContent: '社区更新暂时打不开。' }), retry))
}

try {
  const response = await fetch('/api/community-updates', { credentials: 'omit' })
  if (!response.ok) throw Error('HTTP ' + response.status)
  const data = await response.json()
  const updates = [...(data.updates || [])].reverse() // 清单只追加，倒过来就是最新在前
  $('stale').hidden = !data.stale
  if (!updates.length) {
    list.replaceChildren(el('li', { className: 'cu-empty' }, el('p', { textContent: '还没有更新。第一条可以是你的。' })))
  } else {
    stats(updates)
    render(updates, setupFilters(updates))
  }
} catch {
  failed()
} finally {
  list.removeAttribute('aria-busy')
}
