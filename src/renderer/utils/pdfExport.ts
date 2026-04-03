import React from 'react'
import ReactDOMServer from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

/**
 * CSS styles for PDF export
 */
const PDF_STYLES = `
  :root {
    --text-primary: #2d2d2d;
    --text-secondary: #666666;
    --accent-color: #0969da;
    --border-color: #d0d7de;
    --bg-tertiary: #f3f4f6;
    --bg-secondary: #e5e7eb;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 15px;
    line-height: 1.7;
    color: var(--text-primary);
    background: white;
    padding: 24px 32px;
    max-width: 860px;
    margin: 0 auto;
  }

  h1 {
    font-size: 2em;
    font-weight: 700;
    margin: 0.67em 0;
    padding-bottom: 0.3em;
    border-bottom: 1px solid var(--border-color);
    page-break-after: avoid;
  }

  h2 {
    font-size: 1.5em;
    font-weight: 600;
    margin: 1em 0 0.5em;
    padding-bottom: 0.3em;
    border-bottom: 1px solid var(--border-color);
    page-break-after: avoid;
  }

  h3 {
    font-size: 1.25em;
    font-weight: 600;
    margin: 1em 0 0.5em;
    page-break-after: avoid;
  }

  h4, h5, h6 {
    font-weight: 600;
    margin: 1em 0 0.5em;
    page-break-after: avoid;
  }

  p {
    margin: 0 0 16px;
  }

  a {
    color: var(--accent-color);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }

  ul, ol {
    padding-left: 2em;
    margin: 0 0 16px;
  }

  li {
    margin: 4px 0;
  }

  blockquote {
    margin: 0 0 16px;
    padding: 0 1em;
    border-left: 4px solid var(--accent-color);
    color: var(--text-secondary);
  }

  code {
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    font-size: 0.9em;
  }

  pre {
    background: var(--bg-tertiary);
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 0 0 16px;
    page-break-inside: avoid;
  }

  pre code {
    background: none;
    padding: 0;
    font-size: 0.875em;
    line-height: 1.6;
  }

  table {
    border-collapse: collapse;
    width: 100%;
    margin: 0 0 16px;
    page-break-inside: avoid;
  }

  th, td {
    border: 1px solid var(--border-color);
    padding: 8px 12px;
    text-align: left;
  }

  th {
    background: var(--bg-secondary);
    font-weight: 600;
  }

  img {
    max-width: 100%;
    border-radius: 4px;
    page-break-inside: avoid;
  }

  hr {
    border: none;
    border-top: 2px solid var(--border-color);
    margin: 24px 0;
  }

  .task-list-item {
    list-style: none;
    margin-left: -1.5em;
  }

  .task-list-item input {
    margin-right: 0.5em;
  }

  svg {
    max-width: 100%;
    height: auto;
  }

  .hljs {
    background: var(--bg-tertiary) !important;
    color: var(--text-primary) !important;
  }

  @media print {
    body {
      padding: 0;
      max-width: 100%;
    }
  }
`

/**
 * Convert markdown content to HTML
 */
function renderMarkdownToHtml(markdownContent: string): string {
  const component = ReactMarkdown({
    children: markdownContent,
    remarkPlugins: [remarkGfm],
    rehypePlugins: [rehypeHighlight],
    components: {
      a: ({ node: _node, ...props }) => {
        return React.createElement('a', { ...props, target: '_blank', rel: 'noopener noreferrer' })
      },
      code: ({ node: _node, className, children, ...props }) => {
        const match = /language-(\w+)/.exec(className || '')
        const lang = match ? match[1] : ''

        if (lang === 'mermaid') {
          return React.createElement('pre', { className: 'mermaid' }, children)
        }

        return React.createElement('code', { className, ...props }, children)
      },
    },
  })

  return ReactDOMServer.renderToString(component)
}

/**
 * Build a complete HTML document from markdown content for PDF export
 */
export function buildHtmlForPdf(markdownContent: string): string {
  const htmlContent = renderMarkdownToHtml(markdownContent)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PDF Export</title>
  <style>${PDF_STYLES}</style>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">
</head>
<body>
  <div class="markdown-preview">${htmlContent}</div>
</body>
</html>`
}

/**
 * Export markdown content to PDF
 */
export async function exportMarkdownToPdf(
  markdownContent: string,
  fileName: string,
): Promise<void> {
  // Generate HTML from markdown
  const htmlContent = buildHtmlForPdf(markdownContent)

  // Show save dialog
  const outputPath = await window.api.showSaveDialog(fileName)

  if (!outputPath) {
    throw new Error('Save dialog canceled')
  }

  // Export to PDF
  await window.api.exportPDF(htmlContent, outputPath)
}
