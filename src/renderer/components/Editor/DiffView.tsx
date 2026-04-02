import React, { useMemo } from 'react'

interface DiffLine {
  type: 'same' | 'added' | 'removed' | 'header'
  leftLineNum?: number
  rightLineNum?: number
  content: string
}

interface DiffViewProps {
  original: string
  current: string
  filePath: string
  onClose: () => void
}

function computeDiff(original: string, current: string): DiffLine[] {
  const oldLines = original.split('\n')
  const newLines = current.split('\n')
  const result: DiffLine[] = []

  // Simple LCS-based diff
  const m = oldLines.length
  const n = newLines.length

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to find diff
  const diffOps: Array<{ type: 'same' | 'added' | 'removed'; oldIdx?: number; newIdx?: number }> = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diffOps.unshift({ type: 'same', oldIdx: i - 1, newIdx: j - 1 })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diffOps.unshift({ type: 'added', newIdx: j - 1 })
      j--
    } else {
      diffOps.unshift({ type: 'removed', oldIdx: i - 1 })
      i--
    }
  }

  let leftNum = 0, rightNum = 0
  for (const op of diffOps) {
    if (op.type === 'same') {
      leftNum++; rightNum++
      result.push({ type: 'same', leftLineNum: leftNum, rightLineNum: rightNum, content: oldLines[op.oldIdx!] })
    } else if (op.type === 'removed') {
      leftNum++
      result.push({ type: 'removed', leftLineNum: leftNum, content: oldLines[op.oldIdx!] })
    } else {
      rightNum++
      result.push({ type: 'added', rightLineNum: rightNum, content: newLines[op.newIdx!] })
    }
  }

  return result
}

export default function DiffView({ original, current, filePath, onClose }: DiffViewProps) {
  const diffLines = useMemo(() => computeDiff(original, current), [original, current])

  const fileName = filePath.split('/').pop() || filePath

  const stats = diffLines.reduce((acc, l) => {
    if (l.type === 'added') acc.added++
    if (l.type === 'removed') acc.removed++
    return acc
  }, { added: 0, removed: 0 })

  return (
    <div className="diff-view">
      <div className="diff-header">
        <span className="diff-title">Diff: {fileName}</span>
        <span className="diff-stats">
          <span className="diff-stat-added">+{stats.added}</span>
          <span className="diff-stat-removed">-{stats.removed}</span>
        </span>
        <button className="diff-close" onClick={onClose}>Close</button>
      </div>
      <div className="diff-content">
        <table className="diff-table">
          <tbody>
            {diffLines.map((line, idx) => (
              <tr key={idx} className={`diff-line diff-line-${line.type}`}>
                <td className="diff-gutter diff-gutter-left">
                  {line.leftLineNum ?? ''}
                </td>
                <td className="diff-gutter diff-gutter-right">
                  {line.rightLineNum ?? ''}
                </td>
                <td className="diff-marker">
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </td>
                <td className="diff-code">
                  <pre>{line.content}</pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
