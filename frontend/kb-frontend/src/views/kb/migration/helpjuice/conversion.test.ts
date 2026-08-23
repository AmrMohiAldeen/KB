import { generateHTML, type JSONContent } from '@tiptap/core'
import { describe, expect, it } from 'vitest'

import { convertHelpJuiceHtml } from './conversion'
import { normalizeHelpjuiceHtml } from './normalizeHelpjuiceHtml'
import { prepareHelpjuiceSemanticHtml } from './convertNormalizedHelpjuiceHtml'
import { getEditorExtensions } from '../../../../features/editor/extensions'

function nodesByType(json: unknown, type: string): JSONContent[] {
  const matches: JSONContent[] = []
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const content = node as JSONContent
    if (content.type === type) matches.push(content)
    content.content?.forEach(visit)
  }
  visit(json)
  return matches
}

const jsonText = (json: unknown) => nodesByType(json, 'text').map(node => node.text).join(' ')
describe('Helpjuice semantic HTML conversion', () => {
  it.each([
    ['info', 'helpjuice-callout info'],
    ['success', 'helpjuice-callout success'],
    ['warning', 'callout callout-warning']
  ])('converts the %s callout variant', (variant, className) => {
    const result = convertHelpJuiceHtml(`<div class="${className}"><div class="helpjuice-callout-body"><p>Nested ${variant}</p></div><i class="helpjuice-callout-delete">x</i></div>`)
    const callout = nodesByType(result.tiptapJson, 'callout')[0]

    expect(callout.attrs?.variant).toBe(variant)
    expect(jsonText(callout)).toContain(`Nested ${variant}`)
  })

  it('converts accordions while preserving title and body', () => {
    const result = convertHelpJuiceHtml('<div class="helpjuice-accordion active"><button class="helpjuice-accordion-toggle">toggle</button><h3 class="helpjuice-accordion-title">Install</h3><div class="helpjuice-accordion-body"><p>Run setup</p></div></div>')
    const accordion = nodesByType(result.tiptapJson, 'accordion')[0]
    const item = nodesByType(result.tiptapJson, 'accordionItem')[0]

    expect(accordion).toBeDefined()
    expect(item.attrs?.title).toBe('Install')
    expect(jsonText(item)).toContain('Run setup')
    expect(jsonText(result.tiptapJson)).not.toContain('toggle')
  })

  it('groups adjacent tabs and preserves each title and body', () => {
    const result = convertHelpJuiceHtml(`
      <div class="helpjuice-tab active"><span class="helpjuice-tab-title">One</span><div class="helpjuice-tab-body"><p>First</p></div></div>
      <div class="helpjuice-tab"><span class="helpjuice-tab-title">Two</span><div class="helpjuice-tab-body"><p>Second</p></div><button class="helpjuice-tab-delete">delete</button></div>
    `)
    const tabs = nodesByType(result.tiptapJson, 'tabs')
    const items = nodesByType(result.tiptapJson, 'tabItem')

    expect(tabs).toHaveLength(1)
    expect(items.map(item => item.attrs?.label)).toEqual(['One', 'Two'])
    expect(items.map(jsonText)).toEqual(['First', 'Second'])
  })

  it('does not produce decision-tree migration warnings', () => {
    const result = convertHelpJuiceHtml(`
      <div class="helpjuice-decision-tree">
        <div class="helpjuice-decision-tree-tabs"><div class="helpjuice-decision-tree-tab-nav">Branch A</div>
        <div class="helpjuice-decision-tree-tab-content"><div class="helpjuice-decision-tree-tab-content-inner">
          <div class="helpjuice-decision-tree-first-question">Choose?</div>
          <button class="helpjuice-decision-tree-button"><span class="helpjuice-decision-tree-button-text">Answer A</span></button>
        </div></div></div>
        <button class="helpjuice-decision-tree-add-answers">add</button><button class="helpjuice-decision-tree-add-tab-button">add tab</button>
        <button class="helpjuice-decision-tree-delete">delete</button><button class="helpjuice-decision-tree-delete-button">delete branch</button>
      </div>
    `)

    expect(result.migrationWarnings.map(warning => warning.code)).not.toContain('DECISION_TREE_STATIC_FALLBACK')
  })

  it('maps glossary term attributes to the glossary node', () => {
    const result = convertHelpJuiceHtml('<p>Read <span class="hj-glossary-item" data-id="term_9" data-definition="Standard operating procedure">SOP</span>.</p>')
    const glossary = nodesByType(result.tiptapJson, 'glossary')[0]

    expect(glossary.attrs).toMatchObject({ id: 'term_9', term: 'SOP', definition: 'Standard operating procedure' })
  })

  it('keeps generated glossary page terms and definitions but removes controls', () => {
    const result = convertHelpJuiceHtml('<nav class="alphabetical-navigation">A B C</nav><input type="search"><article class="glossary-article"><div class="glossary-article-header">API</div><div class="glossary-terms"><p>Application programming interface</p></div></article>')

    expect(jsonText(result.tiptapJson)).toContain('API')
    expect(jsonText(result.tiptapJson)).toContain('Application programming interface')
    expect(jsonText(result.tiptapJson)).not.toContain('A B C')
  })

  it('converts resized figures, captions and GIFs to image nodes', () => {
    const result = convertHelpJuiceHtml(`
      <figure class="image image_resized image-style-side" style="width: 320px"><img src="https://cdn.helpjuice.com/shot.png" alt="Shot" width="320"><figcaption>Screenshot caption</figcaption></figure>
      <img class="image image-style-align-left" src="https://cdn.helpjuice.com/animation.gif">
    `)
    const images = nodesByType(result.tiptapJson, 'image')

    expect(images).toHaveLength(2)
    expect(images[0].attrs).toMatchObject({ src: 'https://cdn.helpjuice.com/shot.png', alt: 'Shot', title: 'Screenshot caption', width: 320, imageOffsetPct: 100 })
    expect(images[1].attrs).toMatchObject({ src: 'https://cdn.helpjuice.com/animation.gif', alt: null, imageOffsetPct: 0 })
  })

  it('omits broken and Base64 images with BROKEN_IMAGE warnings', () => {
    const result = convertHelpJuiceHtml('<img class="image" alt="missing"><img src="data:image/png;base64,AAAA">')

    expect(nodesByType(result.tiptapJson, 'image')).toHaveLength(0)
    expect(result.migrationWarnings.filter(warning => warning.code === 'BROKEN_IMAGE')).toHaveLength(2)
    expect(JSON.stringify(result.tiptapJson)).not.toContain('base64')
  })

  it('maps YouTube, MP4, PDF and allowlisted Wizardshot embeds to editor nodes', () => {
    const result = convertHelpJuiceHtml(`
      <iframe src="https://www.youtube.com/embed/abc123" width="800" height="450"></iframe>
      <video><source src="https://cdn.example.com/movie.mp4" type="video/mp4"></video>
      <iframe src="https://cdn.example.com/guide.pdf"></iframe>
      <iframe src="https://www.wizardshot.com/embed/tutorials/36587"></iframe>
    `)
    const youtube = nodesByType(result.tiptapJson, 'youtube')[0]
    const video = nodesByType(result.tiptapJson, 'video')[0]
    const document = nodesByType(result.tiptapJson, 'documentEmbed')[0]
    const external = nodesByType(result.tiptapJson, 'externalEmbed')[0]

    expect(youtube.attrs).toMatchObject({ src: 'https://www.youtube.com/embed/abc123', width: 800, height: 450 })
    expect(video.attrs?.src).toBe('https://cdn.example.com/movie.mp4')
    expect(document.attrs?.src).toBe('https://cdn.example.com/guide.pdf')
    expect(external.attrs?.src).toBe('https://www.wizardshot.com/embed/tutorials/36587')
    expect(result.migrationWarnings.filter(warning => warning.code === 'UNSUPPORTED_EMBED')).toHaveLength(0)
    const rendered = generateHTML(result.tiptapJson as JSONContent, getEditorExtensions())
    expect(rendered).toContain('data-kb-document-embed="true"')
    expect(rendered).toContain('sandbox="allow-scripts allow-forms allow-popups"')
    expect(rendered).not.toContain('allow-same-origin')
  })

  it('rewrites Helpjuice links locally and preserves bookmark and company links safely', () => {
    const result = convertHelpJuiceHtml(`
      <p><a href="/_questions/3815855">Question</a>
      <a href="https://team.helpjuice.com/articles/test" target="_blank">Helpjuice</a>
      <a href="#_bmk40_88">Bookmark</a>
      <a href="https://contoso.sharepoint.com/site">SharePoint</a></p>
    `)
    const links = nodesByType(result.tiptapJson, 'text').flatMap(node => node.marks ?? []).filter(mark => mark.type === 'link')

    expect(links.map(link => link.attrs?.href)).toEqual(expect.arrayContaining([
      '/kb/3815855', '/kb/test', '#_bmk40_88', 'https://contoso.sharepoint.com/site'
    ]))
    expect(links.find(link => link.attrs?.href === '/kb/test')?.attrs?.target).toBe('_self')
  })

  it('preserves semantic tables and flattens screenshot layout tables', () => {
    const semantic = convertHelpJuiceHtml('<table class="table ck-table-resized" style="border: 1px solid red"><colgroup><col width="120"><col width="180"></colgroup><tr><th rowspan="2" style="background-color: yellow; vertical-align: middle; border: 2px solid blue">A</th><td colspan="2">B</td></tr><tr><td>C</td><td>D</td></tr></table>')
    const layout = convertHelpJuiceHtml('<table><tr><td><img src="https://cdn.helpjuice.com/a.png"></td><td></td></tr><tr><td></td><td></td></tr></table>')
    const table = nodesByType(semantic.tiptapJson, 'table')[0]
    const header = nodesByType(semantic.tiptapJson, 'tableHeader')[0]
    const cell = nodesByType(semantic.tiptapJson, 'tableCell')[0]

    expect(table).toBeDefined()
    expect(header.attrs).toMatchObject({ rowspan: 2, backgroundColor: 'yellow', verticalAlign: 'middle', border: '2px solid blue' })
    expect(table.attrs).toMatchObject({ borderTopEnabled: true, borderRightEnabled: true, borderBottomEnabled: true, borderLeftEnabled: true })
    expect(cell.attrs?.colspan).toBe(2)
    expect(nodesByType(layout.tiptapJson, 'table')).toHaveLength(0)
    expect(nodesByType(layout.tiptapJson, 'image')).toHaveLength(1)
    expect(layout.migrationWarnings).toContainEqual(expect.objectContaining({ code: 'LAYOUT_TABLE_FLATTENED' }))
  })

  it('preserves nested Helpjuice text colors as Tiptap textStyle marks', () => {
    const result = convertHelpJuiceHtml(`
      <p style="color: rgb(10, 20, 30)">Outer
        <span style="color:#ff0066">hex <span style="color:rgba(1, 2, 3, 0.5)">nested</span></span>
        <font color="blue">named</font>
      </p>
    `)
    const colors = nodesByType(result.tiptapJson, 'text')
      .flatMap(node => node.marks ?? [])
      .filter(mark => mark.type === 'textStyle')
      .map(mark => mark.attrs?.color)

    expect(colors).toEqual(expect.arrayContaining([
      'rgb(10, 20, 30)', 'rgb(255, 0, 102)', 'rgba(1, 2, 3, 0.5)', 'blue'
    ]))
    const rendered = generateHTML(result.tiptapJson as JSONContent, getEditorExtensions())
    expect(rendered).toContain('color: rgb(255, 0, 102)')
    expect(rendered).toContain('color: rgba(1, 2, 3, 0.5)')
  })

  it('resolves Helpjuice system and CSS-variable colors without visual loss', () => {
    const result = convertHelpJuiceHtml(`
      <p><span style="color: inherit">a</span><span style="color: windowtext">b</span>
      <span style="color: var(--link-default)">c</span>
      <span style="color: var(--communication-foreground,rgba(0, 90, 158, 1))">d</span></p>
    `)
    const colors = nodesByType(result.tiptapJson, 'text').flatMap(node => node.marks ?? [])
      .filter(mark => mark.type === 'textStyle').map(mark => mark.attrs?.color)

    expect(colors).toEqual(expect.arrayContaining(['rgb(0, 0, 0)', 'rgb(0, 103, 184)', 'rgb(0, 90, 158)']))
    expect(result.migrationWarnings).not.toContainEqual(expect.objectContaining({ code: 'UNSUPPORTED_TEXT_COLOR' }))
  })

  it('preserves percentage, pixel, colgroup, and uneven table widths', () => {
    const percentage = convertHelpJuiceHtml(`
      <table style="width:75%"><colgroup><col width="25%"><col style="width:75%"></colgroup>
        <tr><td>A</td><td>B</td></tr>
      </table>
    `)
    const pixels = convertHelpJuiceHtml(`
      <table style="width:640px"><tr><td width="180px">A</td><td style="width:460px">B</td></tr></table>
    `)
    const percentageTable = nodesByType(percentage.tiptapJson, 'table')[0]
    const percentageCells = nodesByType(percentage.tiptapJson, 'tableCell')
    const pixelTable = nodesByType(pixels.tiptapJson, 'table')[0]
    const pixelCells = nodesByType(pixels.tiptapJson, 'tableCell')

    expect(percentageTable.attrs).toMatchObject({ tableWidthPct: 75 })
    expect(percentageCells.map(cell => cell.attrs?.colwidth)).toEqual([[250], [750]])
    expect(pixelTable.attrs).toMatchObject({ tableWidthPx: 640 })
    expect(pixelCells.map(cell => cell.attrs?.colwidth)).toEqual([[180], [460]])
    const rendered = generateHTML(pixels.tiptapJson as JSONContent, getEditorExtensions())
    expect(rendered).toContain('data-table-width-px="640"')
    expect(rendered).toContain('colwidth="180"')
  })

  it('normalizes the Helpjuice zero-percent table sentinel to auto', () => {
    const result = convertHelpJuiceHtml('<table style="width: 0%"><tr><td>A</td></tr></table>')
    const table = nodesByType(result.tiptapJson, 'table')[0]

    expect(table.attrs?.tableWidth).toBe('auto')
    expect(result.migrationWarnings).not.toContainEqual(expect.objectContaining({ code: 'UNSUPPORTED_TABLE_WIDTH' }))
  })

  it('reports unsupported colors and table widths instead of silently dropping them', () => {
    const result = convertHelpJuiceHtml('<span style="color:var(--bad)">Text</span><table style="width:calc(100% - 2px)"><tr><td width="wide">A</td></tr></table>')

    expect(result.migrationWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'UNSUPPORTED_TEXT_COLOR' }),
      expect.objectContaining({ code: 'UNSUPPORTED_TABLE_WIDTH' }),
      expect.objectContaining({ code: 'UNSUPPORTED_TABLE_COLUMN_WIDTH' })
    ]))
  })

  it('maps H5, resolves duplicate IDs, generates TOC data and preserves RTL', () => {
    const result = convertHelpJuiceHtml('<h5 id="generated-1">Overview</h5><h2 id="duplicate">Overview</h2><h2 id="duplicate">Overview</h2><p dir="rtl" style="direction: rtl; text-align: right">مرحبا</p>')
    const headings = nodesByType(result.tiptapJson, 'heading')
    const paragraph = nodesByType(result.tiptapJson, 'paragraph').find(node => jsonText(node).includes('مرحبا'))

    expect(headings.map(heading => heading.attrs?.level)).toEqual([4, 2, 2])
    expect(headings.map(heading => heading.attrs?.id)).toEqual(['overview', 'overview-2', 'overview-3'])
    expect(result.tableOfContents.map(item => item.id)).toEqual(['overview', 'overview-2', 'overview-3'])
    expect(result.migrationWarnings).toContainEqual(expect.objectContaining({ code: 'H5_MAPPED_TO_H4' }))
    expect(paragraph?.attrs).toMatchObject({ dir: 'rtl', textAlign: 'right' })
  })

  it('preserves nested ordered and bullet list styles', () => {
    const result = convertHelpJuiceHtml(`
      <ol style="list-style-type: lower-alpha"><li>Outer<ul style="list-style-type: square"><li>Square<ol type="I"><li>Roman</li></ol></li></ul></li></ol>
    `)

    expect(nodesByType(result.tiptapJson, 'orderedList').map(node => node.attrs?.listStyle)).toEqual(['lower-alpha', 'upper-roman'])
    expect(nodesByType(result.tiptapJson, 'bulletList').map(node => node.attrs?.listStyle)).toEqual(['square'])
  })

  it('converts checkbox source lists to task lists', () => {
    const fixture = '<ul><li><input type="checkbox" checked>Done</li><li><input type="checkbox">Pending</li></ul>'
    const prepared = prepareHelpjuiceSemanticHtml(normalizeHelpjuiceHtml(fixture).html)
    const result = convertHelpJuiceHtml(fixture)

    expect(prepared.html).toContain('data-type="taskList"')
    expect(nodesByType(result.tiptapJson, 'taskList')).toHaveLength(1)
    expect(nodesByType(result.tiptapJson, 'taskItem').map(node => node.attrs?.checked)).toEqual([true, false])
  })
})
