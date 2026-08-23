import type { JSONContent } from '@tiptap/core'

type Side = 'removed' | 'added'
type TextBlock = { node: JSONContent; type: string; text: string }
type Token = { text: string; start: number; end: number }
type Range = { start: number; end: number }

const MAX_LCS_CELLS = 1_000_000
const textBlockTypes = new Set(['paragraph', 'heading', 'codeBlock'])

const clone = (content: JSONContent): JSONContent => JSON.parse(JSON.stringify(content)) as JSONContent

const readText = (node: JSONContent): string => {
  if (typeof node.text === 'string') return node.text
  if (node.type === 'hardBreak') return '\n'
  return node.content?.map(readText).join('') ?? ''
}

const collectBlocks = (root: JSONContent): TextBlock[] => {
  const blocks: TextBlock[] = []
  const visit = (node: JSONContent) => {
    if (textBlockTypes.has(node.type ?? '') || node.content?.some(child => typeof child.text === 'string')) {
      const text = readText(node)
      if (text) blocks.push({ node, type: node.type ?? 'content', text })
      return
    }
    node.content?.forEach(visit)
  }
  visit(root)
  return blocks
}

const tokens = (value: string): Token[] => {
  const result: Token[] = []
  for (const match of value.matchAll(/\s+|[^\s]+/g)) {
    const start = match.index
    result.push({ text: match[0], start, end: start + match[0].length })
  }
  return result
}

const unmatchedRanges = (before: string, after: string): [Range[], Range[]] => {
  const left = tokens(before)
  const right = tokens(after)
  if (left.length * right.length > MAX_LCS_CELLS)
    return [[{ start: 0, end: before.length }], [{ start: 0, end: after.length }]]

  const lengths = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1))
  for (let i = left.length - 1; i >= 0; i--)
    for (let j = right.length - 1; j >= 0; j--)
      lengths[i][j] = left[i].text === right[j].text
        ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1])

  const removed: Range[] = []
  const added: Range[] = []
  let i = 0
  let j = 0
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i].text === right[j].text) { i++; j++; continue }
    if (j < right.length && (i === left.length || lengths[i][j + 1] > lengths[i + 1][j]))
      added.push({ start: right[j].start, end: right[j++].end })
    else
      removed.push({ start: left[i].start, end: left[i++].end })
  }
  return [removed, added]
}

const addDiffMark = (node: JSONContent, ranges: Range[], side: Side) => {
  let offset = 0
  const visit = (current: JSONContent): JSONContent[] => {
    if (typeof current.text === 'string') {
      const start = offset
      const end = start + current.text.length
      offset = end
      const cuts = new Set([start, end])
      ranges.forEach(range => {
        if (range.start > start && range.start < end) cuts.add(range.start)
        if (range.end > start && range.end < end) cuts.add(range.end)
      })
      const points = [...cuts].sort((a, b) => a - b)
      return points.slice(0, -1).map((point, index) => {
        const next = points[index + 1]
        const marked = ranges.some(range => range.start < next && range.end > point)
        return {
          ...current,
          text: current.text!.slice(point - start, next - start),
          marks: marked
            ? [...(current.marks ?? []), { type: 'versionDiff', attrs: { side } }]
            : current.marks
        }
      })
    }
    if (current.type === 'hardBreak') offset += 1
    if (!current.content) return [current]
    return [{ ...current, content: current.content.flatMap(child => visit(child)) }]
  }
  const transformed = visit(node)[0]
  Object.assign(node, transformed)
}

const blockMatches = (before: TextBlock[], after: TextBlock[]): Array<[number, number]> => {
  if (before.length * after.length > MAX_LCS_CELLS) return []
  const lengths = Array.from({ length: before.length + 1 }, () => new Uint32Array(after.length + 1))
  for (let i = before.length - 1; i >= 0; i--)
    for (let j = after.length - 1; j >= 0; j--)
      lengths[i][j] = before[i].type === after[j].type && before[i].text === after[j].text
        ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1])
  const matches: Array<[number, number]> = []
  let i = 0
  let j = 0
  while (i < before.length && j < after.length) {
    if (before[i].type === after[j].type && before[i].text === after[j].text) {
      matches.push([i++, j++])
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) i++
    else j++
  }
  return matches
}

export const createVersionDocumentDiff = (baseContent: JSONContent, targetContent: JSONContent) => {
  const older = clone(baseContent)
  const newer = clone(targetContent)
  const before = collectBlocks(older)
  const after = collectBlocks(newer)
  const matches = [...blockMatches(before, after), [before.length, after.length] as [number, number]]
  let beforeStart = 0
  let afterStart = 0

  matches.forEach(([beforeEnd, afterEnd]) => {
    const beforeRun = before.slice(beforeStart, beforeEnd)
    const afterRun = after.slice(afterStart, afterEnd)
    const paired = Math.min(beforeRun.length, afterRun.length)
    for (let index = 0; index < paired; index++) {
      const [removed, added] = unmatchedRanges(beforeRun[index].text, afterRun[index].text)
      addDiffMark(beforeRun[index].node, removed, 'removed')
      addDiffMark(afterRun[index].node, added, 'added')
    }
    beforeRun.slice(paired).forEach(block => addDiffMark(block.node, [{ start: 0, end: block.text.length }], 'removed'))
    afterRun.slice(paired).forEach(block => addDiffMark(block.node, [{ start: 0, end: block.text.length }], 'added'))
    beforeStart = beforeEnd + 1
    afterStart = afterEnd + 1
  })

  return { older, newer }
}
