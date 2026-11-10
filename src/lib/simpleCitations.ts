import type { SimpleCitation } from './simpleHistory'

export function getCitedMarkdown(text: string, citations: SimpleCitation[]) {
  let end = 0
  let markdown = ''
  for (const citation of [...citations].sort((a, b) => (a.start ?? 0) - (b.start ?? 0))) {
    if (citation.start === undefined || citation.end === undefined || citation.start < end || citation.end > text.length || citation.end < citation.start || !/^https?:\/\//i.test(citation.url)) continue
    markdown += text.slice(end, citation.start) + ` [${citation.title.replace(/[\[\]\\\n]/g, '')}](${citation.url.replace(/[()\s]/g, (char) => char === '(' ? '%28' : char === ')' ? '%29' : encodeURIComponent(char))})`
    end = citation.end
  }
  return markdown + text.slice(end)
}
