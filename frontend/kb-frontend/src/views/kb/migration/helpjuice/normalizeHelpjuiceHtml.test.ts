import { describe, expect, it } from 'vitest'

import { HELPJUICE_CLASS_REGISTRY, normalizeHelpjuiceHtml } from './normalizeHelpjuiceHtml'

const parseBody = (html: string) => new DOMParser().parseFromString(html, 'text/html').body

describe('normalizeHelpjuiceHtml', () => {
  it('repairs malformed font-family attributes before tolerant HTML parsing', () => {
    const result = normalizeHelpjuiceHtml('<p style="font-family:" times new roman>Copy</p>')

    expect(result.html).toContain('font-family: &quot;Times New Roman&quot;')
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'MALFORMED_HTML_REPAIRED' })]))
  })

  it('preserves semantic classes from every Helpjuice content group', () => {
    const fixture = `
      <aside class="helpjuice-callout callout callout-info info"><div class="helpjuice-callout-body">Callout</div></aside>
      <div class="helpjuice-accordion"><h3 class="helpjuice-accordion-title">Title</h3><div class="helpjuice-accordion-body">Body</div></div>
      <div class="helpjuice-tab"><span class="helpjuice-tab-title">Tab</span><div class="helpjuice-tab-body">Body</div></div>
      <div class="helpjuice-decision-tree helpjuice-decision-tree-tabs"><div class="helpjuice-decision-tree-tab-nav"></div><div class="helpjuice-decision-tree-tab-content"><div class="helpjuice-decision-tree-tab-content-inner"><span class="helpjuice-decision-tree-button helpjuice-decision-tree-button-text helpjuice-decision-tree-first-question">Question</span></div></div></div>
      <span class="hj-glossary-item glossary-article glossary-article-header glossary-locked-article glossary-terms">Glossary</span>
      <img class="image image_resized image-style-side image-style-align-left" src="https://example.com/image.png">
      <table class="table ck-table-resized"><tbody><tr><td>Cell</td></tr></tbody></table>
      <span class="video">Video</span>
      <span class="translation-placeholder-locked">Translation</span>
    `
    const result = normalizeHelpjuiceHtml(fixture)
    const body = parseBody(result.html)
    const expectedClasses = [
      'helpjuice-callout', 'callout', 'callout-info', 'info', 'helpjuice-callout-body',
      'helpjuice-accordion', 'helpjuice-accordion-title', 'helpjuice-accordion-body',
      'helpjuice-tab', 'helpjuice-tab-title', 'helpjuice-tab-body',
      'helpjuice-decision-tree', 'helpjuice-decision-tree-tabs', 'helpjuice-decision-tree-tab-nav',
      'helpjuice-decision-tree-tab-content', 'helpjuice-decision-tree-tab-content-inner',
      'helpjuice-decision-tree-button', 'helpjuice-decision-tree-button-text', 'helpjuice-decision-tree-first-question',
      'hj-glossary-item', 'glossary-article', 'glossary-article-header', 'glossary-locked-article', 'glossary-terms',
      'image', 'image_resized', 'image-style-side', 'image-style-align-left', 'table', 'ck-table-resized', 'video',
      'translation-placeholder-locked'
    ]

    expectedClasses.forEach(className => expect(body.querySelector(`.${className}`), className).not.toBeNull())
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'TRANSLATION_PLACEHOLDER', severity: 'error' }))
  })

  it('unwraps source wrappers, including an italic helpjuice thread, without adding formatting', () => {
    const result = normalizeHelpjuiceHtml(`
      <div class="article-body"><i class="helpjuice-thread"><span>Plain thread</span></i></div>
      <div class="video-wrapper"><div class="video-player"><div class="video-player-pre">Video copy</div></div></div>
      <div class="table"><table><tr><td>Cell</td></tr></table></div>
    `)

    expect(result.html).not.toMatch(/article-body|helpjuice-thread|video-wrapper|video-player|class="table"/)
    expect(result.html).not.toContain('<i')
    expect(result.html).toContain('<span>Plain thread</span>')
    expect(result.html).toContain('<table>')
  })

  it('removes editor controls and their nested icons while retaining generic classes elsewhere', () => {
    const controls = Array.from(HELPJUICE_CLASS_REGISTRY.removeControls)
      .map(className => `<button class="${className} btn active"><i class="fas fa-lock-alt"></i>Remove</button>`)
      .join('')
    const result = normalizeHelpjuiceHtml(`${controls}<p class="active btn grow flex-grow far fas fa-comment-alt-plus fa-language fa-lock-alt fa-w-16">Keep</p>`)

    controls.split('</button>').slice(0, -1).forEach(control => {
      const className = control.match(/class="([^ ]+)/)?.[1]
      expect(result.html).not.toContain(className)
    })
    expect(result.html).toContain('class="active btn grow flex-grow far fas fa-comment-alt-plus fa-language fa-lock-alt fa-w-16"')
  })

  it('strips Office/source classes, generated classes, attributes and namespace wrappers', () => {
    const result = normalizeHelpjuiceHtml(`
      <div class="MsoNormal BCX0 fui-Chat ui-provider SCXW123 ps12 ts9 ___hash f1abc r2xyz custom"
        data-mce-style="x" data-ccp-props="y" data-teams="z" data-controller="c"
        data-editor--state="s" paraid="1" paraeid="2" uploadprocessed="true" data-toc="yes">
        <o:p>Office text</o:p><v:shape><v:imagedata src="https://example.com/office.png"></v:imagedata><v:path></v:path><o:lock></o:lock></v:shape>
      </div>
    `)
    const body = parseBody(result.html)
    const wrapper = body.querySelector('div')

    expect(wrapper?.className).toBe('custom')
    expect(Array.from(wrapper?.attributes ?? []).map(attribute => attribute.name)).toEqual(['class'])
    expect(result.html).toContain('Office text')
    expect(result.html).toContain('<img src="https://example.com/office.png">')
    expect(result.html).not.toMatch(/(?:o|v):/)
  })

  it('keeps normal image sources and temporarily preserves Base64-only images', () => {
    const base64 = 'data:image/png;base64,AAAA'
    const onlyBase64 = normalizeHelpjuiceHtml(`<img data-mce-src="${base64}">`)
    const normalSource = normalizeHelpjuiceHtml(`<img src="https://example.com/image.png" data-mce-src="${base64}">`)

    expect(onlyBase64.html).toContain(`src="${base64}"`)
    expect(onlyBase64.html).not.toContain('data-mce-src')
    expect(onlyBase64.warnings).toContainEqual(expect.objectContaining({ code: 'BASE64_MEDIA_FOUND' }))
    expect(normalSource.html).toContain('src="https://example.com/image.png"')
    expect(normalSource.html).not.toContain('data-mce-src')
    expect(normalSource.warnings).not.toContainEqual(expect.objectContaining({ code: 'BASE64_MEDIA_FOUND' }))
  })

  it('filters styles, normalizes supported fonts, and keeps RTL direction separate from alignment', () => {
    const result = normalizeHelpjuiceHtml(`
      <p dir="rtl" style="direction: rtl; text-align: right; font-family: Tahoma, sans-serif; color: red; margin: 20px; padding: 5px; mso-bidi-font-family: Arial; background-image: url(data:image/png;base64,AAAA)">مرحبا</p>
    `)
    const paragraph = parseBody(result.html).querySelector('p')

    expect(paragraph?.getAttribute('dir')).toBe('rtl')
    expect(paragraph?.style.direction).toBe('rtl')
    expect(paragraph?.style.textAlign).toBe('right')
    expect(paragraph?.style.fontFamily).toBe('Tahoma')
    expect(paragraph?.getAttribute('style')).not.toMatch(/margin|padding|mso-|background-image/)

    const directionOnly = parseBody(normalizeHelpjuiceHtml('<p style="direction: rtl">اتجاه</p>').html).querySelector('p')
    expect(directionOnly?.getAttribute('dir')).toBe('rtl')
  })

  it('normalizes blank paragraphs and breaks while preserving code whitespace', () => {
    const result = normalizeHelpjuiceHtml('<p>&nbsp;</p><p>First&nbsp;line</p><p>&nbsp;</p><p> </p><p>Last</p><p></p><br><br><br><br><pre>  a\n  b&nbsp;</pre>')

    expect(result.html.match(/<p> <\/p>/g)).toHaveLength(1)
    expect(result.html).toContain('<p>First line</p>')
    expect(result.html).not.toMatch(/<br><br><br>/)
    expect(result.html).toContain('<pre>  a\n  b&nbsp;</pre>')
  })
})
