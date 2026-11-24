// Saves a file. Inside the Claude preview it uses the viewer's download prompt;
// everywhere else it uses a normal browser download.
export async function saveFile(filename, data, mime) {
  const dl = window.claude?.use ? await window.claude.use('downloads').catch(() => null) : null
  if (dl) return dl.save({ filename, data })
  const url = URL.createObjectURL(new Blob([data], { type: mime }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
