const root = document.getElementById('updates')
try {
  const response = await fetch('/api/community-updates', { credentials: 'omit' })
  if (!response.ok) throw Error('更新暂不可用')
  const { updates } = await response.json()
  if (!updates.length) {
    root.textContent = '社区更新将在投稿合并后显示在这里。'
  } else {
    const articles = [...updates].reverse().map(({ issue, title, body }) => {
      const article = document.createElement('article')
      const heading = document.createElement('h2')
      const content = document.createElement('p')
      const link = document.createElement('a')
      heading.textContent = title
      content.textContent = body
      link.href = 'https://github.com/kourou25/jinhuan/issues/' + issue
      link.textContent = '查看需求 #' + issue
      article.append(heading, content, link)
      return article
    })
    root.replaceChildren(...articles)
  }
} catch {
  root.textContent = '社区更新暂时打不开，请刷新重试。'
}
