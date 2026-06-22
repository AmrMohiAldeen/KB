/**
 * Tests the paste sanitizer end-to-end:
 * - empty/plain/malformed HTML handling and sanitizer failure reasons
 * - unsafe tags, event handlers, scripts, media, SVG/MathML, comments, and Office noise removal
 * - URL sanitization for safe links, unsafe protocols, obfuscated protocols, and protocol-relative URLs
 * - CSS/style sanitization, including dangerous CSS, safe colors, font sizes, line heights, and cancelled formatting
 * - Word/Google Docs/Apple paste normalization, legacy font tags, whitespace, and list conversion
 * - table structure normalization, invalid fragments, width/offset metadata, clamping, and supported table attrs
 * - KB-specific blocks/attributes, task lists/items, headings/lists/inline formatting, and Tiptap schema round-trips
 * - editor paste pipeline behavior, failure callbacks, node/depth/size limits, and performance regression coverage
 */
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEditorExtensions, type EditorExtensionOptions } from '../extensions';
import {
  sanitizePastedHTML,
  sanitizePastedHTMLWithResult,
} from './sanitizePastedHtml';

const editors: Editor[] = [];
const editorElements: HTMLElement[] = [];

function pasteHTML(editor: Editor, html: string, text = ''): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) =>
        type === 'text/html' ? html : type === 'text/plain' ? text : '',
    },
  });
  editor.view.dom.dispatchEvent(event);
  return event;
}

function createEditor(
  content = '<p>Replace me</p>',
  extensionOptions: EditorExtensionOptions = {},
): Editor {
  const element = document.createElement('div');
  document.body.append(element);

  const editor = new Editor({
    element,
    extensions: getEditorExtensions(extensionOptions),
    content,
  });

  editors.push(editor);
  editorElements.push(element);
  return editor;
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
  editorElements.splice(0).forEach((element) => element.remove());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function sanitizedFragment(html: string): HTMLDivElement {
  const container = document.createElement('div');
  container.innerHTML = sanitizePastedHTML(html);
  return container;
}

function expectValidTableStructure(root: ParentNode): void {
  root.querySelectorAll('td, th').forEach((cell) => {
    expect(cell.parentElement?.tagName.toLowerCase()).toBe('tr');
  });

  root.querySelectorAll('tr').forEach((row) => {
    expect(['table', 'thead', 'tbody', 'tfoot']).toContain(
      row.parentElement?.tagName.toLowerCase(),
    );
  });

  root.querySelectorAll('thead, tbody, tfoot').forEach((section) => {
    expect(section.parentElement?.tagName.toLowerCase()).toBe('table');
  });

  root.querySelectorAll('table').forEach((table) => {
    Array.from(table.children).forEach((child) => {
      expect(['colgroup', 'thead', 'tbody', 'tfoot']).toContain(
        child.tagName.toLowerCase(),
      );
    });
  });
}

function expectNoExecutableHtml(html: string): void {
  expect(html).not.toMatch(/javascript\s*:/i);
  expect(html).not.toMatch(/vbscript\s*:/i);
  expect(html).not.toMatch(/expression\s*\(/i);
  expect(html).not.toMatch(/url\s*\(/i);
  expect(html).not.toMatch(/<script/i);
  expect(html).not.toMatch(/<svg/i);
  expect(html).not.toMatch(/<math/i);
  expect(html).not.toMatch(/<iframe/i);
  expect(html).not.toMatch(/<embed/i);
  expect(html).not.toMatch(/<object/i);
  expect(html).not.toMatch(/\son[a-z]+\s*=/i);
}

function insertSanitizedIntoEditor(html: string): Editor {
  const result = sanitizePastedHTMLWithResult(html);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Unexpected sanitizer failure: ${result.reason}`);

  const editor = createEditor('<p></p>');
  editor.commands.setContent(result.html);

  expect(() => editor.state.doc.check()).not.toThrow();
  return editor;
}

function editorNodeNames(editor: Editor): string[] {
  const names: string[] = [];

  editor.state.doc.descendants((node) => {
    names.push(node.type.name);
  });

  return names;
}

describe('sanitizePastedHTML', () => {
  it('treats empty HTML as a successful no-op', () => {
    expect(sanitizePastedHTMLWithResult('')).toEqual({ ok: true, html: '' });
    expect(sanitizePastedHTML('')).toBe('');
  });

  it('preserves plain text without classifying it as sanitizer failure', () => {
    const result = sanitizePastedHTMLWithResult('hello');

    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty('reason');
    if (!result.ok) return;

    const container = document.createElement('div');
    container.innerHTML = result.html;

    expect(container.textContent).toBe('hello');
    expect(result.html).toContain('hello');
  });

  it('removes scripts, event handlers, unsafe wrappers, and unknown dangerous tags', () => {
    const html = sanitizePastedHTML([
      '<p onclick="alert(1)" onmouseover="alert(2)">Safe text</p>',
      '<script>alert(1)</script>',
      '<style>p { color: red; }</style>',
      '<iframe src="https://example.com"></iframe>',
      '<svg onload="alert(3)"><circle></circle></svg>',
      '<form><input value="hidden"></form>',
    ].join(''));

    expect(html).toContain('<p>Safe text</p>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<style');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('onmouseover');
  });

  it('removes javascript links while preserving their text', () => {
    const html = sanitizePastedHTML(
      '<p><a href="javascript:alert(1)" target="_blank">Unsafe link</a></p>',
    );

    expect(html).toContain('Unsafe link');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('target=');
  });

  it('rejects protocol-relative URLs and backslash network-path URLs', () => {
    const html = sanitizePastedHTML([
      '<p>',
      '<a href="//evil.example/path">Protocol relative</a>',
      '<a href="\\\\evil.example\\path">Backslash relative</a>',
      '</p>',
    ].join(''));

    expect(html).toContain('Protocol relative');
    expect(html).toContain('Backslash relative');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('evil.example');
  });

  it('rejects relative URLs with spaces, control characters, quotes, angle brackets, or backslashes', () => {
    const html = sanitizePastedHTML([
      '<p>',
      '<a href="/safe/path">Safe relative</a>',
      '<a href="/bad path">Space relative</a>',
      '<a href="/bad\tpath">Control relative</a>',
      '<a href="/bad&quot;path">Quote relative</a>',
      '<a href="/bad<path>">Angle relative</a>',
      '<a href="folder\\file">Backslash relative</a>',
      '</p>',
    ].join(''));

    expect(html).toContain('href="/safe/path"');
    expect(html).toContain('Safe relative');
    expect(html).toContain('Space relative');
    expect(html).toContain('Control relative');
    expect(html).toContain('Quote relative');
    expect(html).toContain('Angle relative');
    expect(html).toContain('Backslash relative');
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it('keeps link title text safe and only preserves target on safe blank links', () => {
    const html = sanitizePastedHTML([
      '<p>',
      '<a href="https://example.com" target="_blank" title="Safe <bad> title">Blank safe</a>',
      '<a href="https://example.org" target="_self">Self safe</a>',
      '<a href="javascript:alert(1)" target="_blank" title="Bad title">Bad href</a>',
      '</p>',
    ].join(''));

    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('title="Safe bad title"');
    expect(html).toContain('href="https://example.org/"');
    expect(html).not.toContain('target="_self"');
    expect(html).toContain('Bad href');
    expect(html).not.toContain('Bad title');
    expect(html).not.toContain('javascript:');
  });

  it.each([
    '<a href="java&#x0A;script:alert(1)">bad</a>',
    '<a href=" JAVASCRIPT:alert(1)">bad</a>',
    '<a href="java\tScript:alert(1)">bad</a>',
    '<a href="vbscript:msgbox(1)">bad</a>',
  ])('neutralizes obfuscated unsafe hrefs: %s', (linkHtml) => {
    const html = sanitizePastedHTML(`<p>${linkHtml}</p>`);

    expect(html).toContain('bad');
    expect(html).not.toContain('<a');
    expectNoExecutableHtml(html);
  });

  it.each([
    'background-image:url(javascript:alert(1))',
    'color: expression(alert(1))',
    String.raw`color: \65xpression(alert(1))`,
    String.raw`color: \000065 xpression(alert(1))`,
    'behavior: url(#default#time2)',
  ])('removes dangerous style declarations: %s', (style) => {
    const html = sanitizePastedHTML(
      `<p><span style="${style}; font-weight: bold">bad</span></p>`,
    );

    expect(html).toContain('bad');
    expect(html).toContain('font-weight: bold');
    expectNoExecutableHtml(html);
    expect(html).not.toContain('background-image');
    expect(html).not.toContain('behavior');
  });

  it('preserves safe absolute, mailto, and relative links', () => {
    const html = sanitizePastedHTML([
      '<p>',
      '<a href="http://example.com/docs">HTTP</a>',
      '<a href="https://example.com/docs" target="_blank">External</a>',
      '<a href="mailto:team@example.com">Email</a>',
      '<a href="tel:+15551234567">Phone</a>',
      '<a href="/kb/article#section">Internal</a>',
      '<a href="#local-heading">Anchor</a>',
      '</p>',
    ].join(''));

    expect(html).toContain('href="http://example.com/docs"');
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="mailto:team@example.com"');
    expect(html).toContain('href="tel:+15551234567"');
    expect(html).toContain('href="/kb/article#section"');
    expect(html).toContain('href="#local-heading"');
  });

  it('removes raw pasted media HTML instead of storing unsafe or base64 sources', () => {
    const html = sanitizePastedHTML([
      '<p>Before</p>',
      '<img src="data:image/png;base64,AAAA" onerror="alert(1)" alt="inline">',
      '<img src="data:image/gif;base64,BBBB" alt="inline gif">',
      '<img src="https://tracker.example/pixel.png" width="1" height="1">',
      '<picture><source srcset="data:image/webp;base64,CCCC"><img src="safe.gif"></picture>',
      '<video controls src="data:video/mp4;base64,DDDD"><source src="clip.mp4"><track src="captions.vtt"></video>',
      '<audio controls src="data:audio/mp3;base64,EEEE"></audio>',
      '<object data="movie.swf">Fallback</object>',
      '<embed src="movie.swf">',
      '<math><mi>x</mi></math>',
      '<p>After</p>',
    ].join(''));

    expect(html).toContain('<p>Before</p>');
    expect(html).toContain('<p>After</p>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<picture');
    expect(html).not.toContain('<source');
    expect(html).not.toContain('<video');
    expect(html).not.toContain('<track');
    expect(html).not.toContain('<audio');
    expect(html).not.toContain('<object');
    expect(html).not.toContain('<embed');
    expect(html).not.toContain('<math');
    expect(html).not.toContain('data:image');
    expect(html).not.toContain('data:video');
    expect(html).not.toContain('data:audio');
    expect(html).not.toContain('safe.gif');
    expect(html).not.toContain('tracker.example');
  });

  it('preserves headings, lists, nested lists, and inline formatting', () => {
    const html = sanitizePastedHTML([
      '<h1>Title</h1>',
      '<h5>Deep heading</h5>',
      '<p><b>Bold</b> <i>Italic</i> <u>Underline</u> <s>Strike</s></p>',
      '<blockquote><p>Quoted<br>line</p></blockquote>',
      '<pre><code class="language-ts" onclick="alert(1)">const value = 1;</code></pre>',
      '<p><code>inline()</code></p>',
      '<ul><li>Parent<ul><li><strong>Child</strong></li></ul></li></ul>',
    ].join(''));

    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<em>Italic</em>');
    expect(html).toContain('<u>Underline</u>');
    expect(html).toContain('<s>Strike</s>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<br>');
    expect(html).toContain('<pre><code class="language-ts">const value = 1;</code></pre>');
    expect(html).toContain('<code>inline()</code>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>');
    expect(html).toContain('Child');
  });

  it('unwraps formatting tags that are visually cancelled by CSS', () => {
    const html = sanitizePastedHTML([
      '<p>',
      '<strong style="font-weight: normal">Not bold</strong>',
      '<b style="font-weight: 400">Also not bold</b>',
      '<em style="font-style: normal">Not italic</em>',
      '<i style="font-style: normal">Also not italic</i>',
      '<u style="text-decoration: none">Not underline</u>',
      '<s style="text-decoration: none">Not strike</s>',
      '</p>',
    ].join(''));

    expect(html).toContain('Not bold');
    expect(html).toContain('Also not bold');
    expect(html).toContain('Not italic');
    expect(html).toContain('Also not italic');
    expect(html).toContain('Not underline');
    expect(html).toContain('Not strike');
    expect(html).not.toContain('<strong');
    expect(html).not.toContain('<b');
    expect(html).not.toContain('<em');
    expect(html).not.toContain('<i');
    expect(html).not.toContain('<u');
    expect(html).not.toContain('<s');
  });

  it('converts legacy font tags to safe span styles and removes legacy font attrs', () => {
    const html = sanitizePastedHTML(
      '<p><font color="#ff0000" size="4" face="Papyrus">Legacy text</font></p>',
    );

    expect(html).toContain('Legacy text');
    expect(html).toContain('<span');
    expect(html).toContain('color: rgb(255, 0, 0)');
    expect(html).toContain('font-size:');
    expect(html).not.toContain('<font');
    expect(html).not.toContain('face=');
    expect(html).not.toContain('size=');
    expect(html).not.toContain('color="#ff0000"');
  });

  it('normalizes text whitespace while preserving code/pre line breaks', () => {
    const html = sanitizePastedHTML([
      '<p>One\t\n\r  two&nbsp;&nbsp;three</p>',
      '<pre><code>line1\r\nline2\rline3</code></pre>',
    ].join(''));

    expect(html).toContain('<p>One two three</p>');
    expect(html).toContain('line1\nline2\nline3');
  });

  it('preserves nested ordered, unordered, and mixed safe lists', () => {
    const fragment = sanitizedFragment([
      '<ol><li>Ordered parent<ol><li>Ordered child</li></ol></li></ol>',
      '<ul><li>Bullet parent<ul><li>Bullet child</li></ul></li></ul>',
      '<ol><li>Mixed parent<ul><li>Mixed bullet child<ol><li>Mixed ordered grandchild</li></ol></li></ul></li></ol>',
    ].join(''));

    expect(fragment.querySelector('ol > li > ol > li')?.textContent).toContain(
      'Ordered child',
    );
    expect(fragment.querySelector('ul > li > ul > li')?.textContent).toContain(
      'Bullet child',
    );

    const mixedParent = Array.from(fragment.querySelectorAll('ol > li')).find(
      (item) => item.textContent?.includes('Mixed parent'),
    );
    expect(mixedParent?.querySelector('ul > li')?.textContent).toContain(
      'Mixed bullet child',
    );
    expect(mixedParent?.querySelector('ul > li > ol > li')?.textContent).toContain(
      'Mixed ordered grandchild',
    );
  });

  it('preserves clean tables with safe spans and supported table attributes', () => {
    const html = sanitizePastedHTML([
      '<table style="width: 65%" onclick="alert(1)">',
      '<thead><tr data-row-height="42"><th colspan="2" style="text-align:center;background-color:#ffeeaa">Head</th></tr></thead>',
      '<tbody><tr><td rowspan="2" colwidth="120">A</td><td>B</td></tr></tbody>',
      '</table>',
    ].join(''));

    expect(html).toContain('<table');
    expect(html).toContain('data-table-width-pct="65"');
    expect(html).toContain('width: 65%');
    expect(html).toContain('margin-left: 0%');
    expect(html).toContain('<thead>');
    expect(html).toContain('<tbody>');
    expect(html).toContain('colspan="2"');
    expect(html).toContain('rowspan="2"');
    expect(html).toContain('colwidth="120"');
    expect(html).toContain('align="center"');
    expect(html).toContain('data-cell-background-color=');
    expect(html).not.toContain('onclick');
  });

  it('converts safe table width and offset sources into editor metadata', () => {
    const fragment = sanitizedFragment([
      '<table width="50%"><tbody><tr><td>Width attr</td></tr></tbody></table>',
      '<table style="width: 50%; margin-left: 0%"><tbody><tr><td>Style width</td></tr></tbody></table>',
      '<table data-table-width-pct="80" data-table-offset-pct="0"><tbody><tr><td>Data attrs</td></tr></tbody></table>',
    ].join(''));
    const tables = Array.from(fragment.querySelectorAll('table'));

    expect(tables).toHaveLength(3);
    expect(tables[0].dataset.tableWidthPct).toBe('50');
    expect(tables[0].dataset.tableOffsetPct).toBe('0');
    expect(tables[0].hasAttribute('width')).toBe(false);
    expect(tables[1].dataset.tableWidthPct).toBe('50');
    expect(tables[1].dataset.tableOffsetPct).toBe('0');
    expect(tables[1].style.marginLeft).toBe('0%');
    expect(tables[2].dataset.tableWidthPct).toBe('80');
    expect(tables[2].dataset.tableOffsetPct).toBe('0');
    expectValidTableStructure(fragment);
  });

  it('wraps direct table rows into tbody without merging row runs across table sections', () => {
    const fragment = sanitizedFragment([
      '<table>',
      '<tr><td>Before header</td></tr>',
      '<thead><tr><th>Header</th></tr></thead>',
      '<tr><td>After header</td></tr>',
      '</table>',
    ].join(''));

    const table = fragment.querySelector('table');
    expect(table).toBeTruthy();
    expect(table?.children[0]?.tagName.toLowerCase()).toBe('tbody');
    expect(table?.children[1]?.tagName.toLowerCase()).toBe('thead');
    expect(table?.children[2]?.tagName.toLowerCase()).toBe('tbody');
    expect(table?.children[0]?.textContent).toContain('Before header');
    expect(table?.children[2]?.textContent).toContain('After header');
    expectValidTableStructure(fragment);
  });

  it('clamps table offset so width plus offset does not exceed 100%', () => {
    const fragment = sanitizedFragment(
      '<table data-table-width-pct="80" data-table-offset-pct="50"><tbody><tr><td>A</td></tr></tbody></table>',
    );

    const table = fragment.querySelector('table');
    expect(table?.getAttribute('data-table-width-pct')).toBe('80');
    expect(table?.getAttribute('data-table-offset-pct')).toBe('20');
    expect(table?.style.width).toBe('80%');
    expect(table?.style.marginLeft).toBe('20%');
  });

  it('falls back to default table layout when pasted width and offset are invalid', () => {
    const fragment = sanitizedFragment(
      '<table width="500" style="width: 500px; margin-left: 500px"><tbody><tr><td>A</td></tr></tbody></table>',
    );

    const table = fragment.querySelector('table');
    expect(table?.getAttribute('data-table-width-pct')).toBe('100');
    expect(table?.getAttribute('data-table-offset-pct')).toBe('0');
    expect(table?.hasAttribute('width')).toBe(false);
    expect(table?.style.width).toBe('100%');
    expect(table?.style.marginLeft).toBe('0%');
  });

  it('removes invalid table span, row-height, and colwidth values while preserving valid values', () => {
    const html = sanitizePastedHTML([
      '<table><colgroup><col span="2" width="120"><col span="999" width="10"></colgroup>',
      '<tbody>',
      '<tr data-row-height="42"><td colspan="2" rowspan="3" colwidth="120,220">Valid</td></tr>',
      '<tr data-row-height="900"><td colspan="0" rowspan="999" colwidth="bad,220">Invalid</td></tr>',
      '</tbody></table>',
    ].join(''));

    expect(html).toContain('span="2"');
    expect(html).toContain('width="120"');
    expect(html).toContain('data-row-height="42"');
    expect(html).toContain('colspan="2"');
    expect(html).toContain('rowspan="3"');
    expect(html).toContain('colwidth="120,220"');
    expect(html).toContain('Invalid');
    expect(html).not.toContain('span="999"');
    expect(html).not.toContain('width="10"');
    expect(html).not.toContain('data-row-height="900"');
    expect(html).not.toContain('colspan="0"');
    expect(html).not.toContain('rowspan="999"');
    expect(html).not.toContain('colwidth="bad,220"');
  });

  it('removes invalid table fragments while preserving valid tables', () => {
    const fragment = sanitizedFragment([
      '<td>Floating cell</td>',
      '<th>Floating header</th>',
      '<tr><td>Row outside table</td></tr>',
      '<table><caption>Bad caption</caption><tbody><tr><td>Valid</td></tr></tbody></table>',
      '<table><tbody><tr><td>Also valid</td></tr></tbody></table>',
    ].join(''));
    const html = fragment.innerHTML;

    expect(html).toContain('Valid');
    expect(html).toContain('Also valid');
    expect(html).not.toContain('Bad caption');
    expect(Array.from(fragment.children).some((child) =>
      ['td', 'th', 'tr'].includes(child.tagName.toLowerCase()),
    )).toBe(false);
    expectValidTableStructure(fragment);
  });

  it('cleans Word and Google Docs noise while preserving semantic list content', () => {
    const html = sanitizePastedHTML([
      '<!--[if gte mso 9]><xml>metadata</xml><![endif]-->',
      '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1;margin-left:36pt">',
      '<span style="mso-list:Ignore">1.<span>&nbsp;&nbsp;</span></span>',
      '<b>First item</b></p>',
      '<p class="MsoListParagraph" style="mso-list:l0 level2 lfo1;margin-left:72pt">',
      '<span style="mso-list:Ignore">a.<span>&nbsp;&nbsp;</span></span>',
      'Nested item</p>',
      '<p id="docs-internal-guid-123" style="line-height:1.38;margin-top:0pt">',
      '<span style="font-size:11pt;color:#000000;background-color:transparent;font-weight:700;white-space:pre-wrap">',
      'Docs text</span></p>',
      '<p><span class="Apple-converted-space">&nbsp;</span>After list</p>',
    ].join(''));

    expect(html).toContain('<ol>');
    expect(html).toContain('<strong>First item</strong>');
    expect(html).toContain('Nested item');
    expect(html).toContain('Docs text');
    expect(html).toContain('<p> After list</p>');
    expect(html).not.toContain('Mso');
    expect(html).not.toContain('mso-list');
    expect(html).not.toContain('docs-internal-guid');
    expect(html).not.toContain('white-space');
    expect(html).not.toContain('margin-top');
    expect(html).not.toContain('Apple-converted-space');
    expect(html).not.toContain('<xml');
    expect(html).not.toContain('<!--');
  });

  it('removes unsafe styles and arbitrary classes while preserving safe supported styles', () => {
    const html = sanitizePastedHTML([
      '<p class="external tracking MsoNormal" style="position:absolute;text-align:center;background-image:url(javascript:alert(1))">',
      '<span style="color:#123456;background-color:#ffee00;font-size:18px;line-height:1.5;font-family:Papyrus">',
      'Styled text',
      '</span>',
      '<span style="font-size:999px;color:expression(alert(1))">Bad style</span>',
      '</p>',
    ].join(''));

    expect(html).toContain('text-align: center');
    expect(html).toContain('<mark');
    expect(html).toContain('background-color: rgb(255, 238, 0)');
    expect(html).toContain('color: rgb(18, 52, 86)');
    expect(html).toContain('font-size: 18px');
    expect(html).toContain('line-height: 1.5');
    expect(html).toContain('Bad style');
    expect(html).not.toContain('class=');
    expect(html).not.toContain('position');
    expect(html).not.toContain('background-image');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('expression');
    expect(html).not.toContain('999px');
    expect(html).not.toContain('font-family');
  });

  it('preserves app-owned KB block attributes but removes arbitrary editor-breaking attributes', () => {
    const html = sanitizePastedHTML([
      '<aside data-kb-callout data-kb-callout-variant="tip" class="site-card" contenteditable="true">',
      '<div data-kb-callout-content draggable="true"><p>Tip body</p></div>',
      '</aside>',
      '<div data-kb-tabs class="tabs"><section data-kb-tab-item data-kb-tab-id="tab_1" data-kb-tab-label="Intro">',
      '<h3 data-kb-tab-label-static>Intro</h3><div data-kb-tab-panel><p>Tab body</p></div>',
      '</section></div>',
      '<div data-kb-accordion><details data-kb-accordion-item data-kb-accordion-id="acc_1" data-kb-accordion-title="FAQ" open>',
      '<summary data-kb-accordion-title-static>FAQ</summary><div data-kb-accordion-panel><p>Answer</p></div>',
      '</details></div>',
      '<div data-random="tracking" data-kb-unknown="x" class="wrapper"><p>Wrapped</p></div>',
    ].join(''));

    expect(html).toContain('data-kb-callout=""');
    expect(html).toContain('data-kb-callout-variant="tip"');
    expect(html).toContain('data-kb-callout-content=""');
    expect(html).toContain('<p>Tip body</p>');
    expect(html).toContain('data-kb-tabs=""');
    expect(html).toContain('data-kb-tab-item=""');
    expect(html).toContain('data-kb-tab-id="tab_1"');
    expect(html).toContain('data-kb-tab-label="Intro"');
    expect(html).toContain('data-kb-tab-label-static=""');
    expect(html).toContain('data-kb-tab-panel=""');
    expect(html).toContain('<p>Tab body</p>');
    expect(html).toContain('data-kb-accordion=""');
    expect(html).toContain('data-kb-accordion-item=""');
    expect(html).toContain('data-kb-accordion-id="acc_1"');
    expect(html).toContain('data-kb-accordion-title="FAQ"');
    expect(html).toContain('data-kb-accordion-title-static=""');
    expect(html).toContain('data-kb-accordion-panel=""');
    expect(html).toContain('<p>Answer</p>');
    expect(html).toContain('<p>Wrapped</p>');
    expect(html).not.toContain('contenteditable');
    expect(html).not.toContain('draggable');
    expect(html).not.toContain('class=');
    expect(html).not.toContain('data-random');
    expect(html).not.toContain('data-kb-unknown');
  });

  it('normalizes invalid KB callout variants and removes unsafe KB ids/labels', () => {
    const html = sanitizePastedHTML([
      '<aside data-kb-callout data-kb-callout-variant="unknown"><div data-kb-callout-content><p>Callout</p></div></aside>',
      '<section data-kb-tab-item data-kb-tab-id="../bad" data-kb-tab-label="<script>Bad</script>"><p>Tab</p></section>',
      '<details data-kb-accordion-item data-kb-accordion-id="bad id" data-kb-accordion-title="<img>FAQ</img>" open><summary>FAQ</summary></details>',
    ].join(''));

    expect(html).toContain('data-kb-callout=""');
    expect(html).toContain('data-kb-callout-variant=');
    expect(html).toContain('Callout');
    expect(html).toContain('data-kb-tab-item=""');
    expect(html).not.toContain('data-kb-tab-id="../bad"');
    expect(html).toContain('data-kb-tab-label="scriptBad/script"');
    expect(html).toContain('data-kb-accordion-item=""');
    expect(html).not.toContain('data-kb-accordion-id="bad id"');
    expect(html).toContain('data-kb-accordion-title="imgFAQ/img"');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
  });

  it('preserves safe Tiptap task list attributes and removes invalid task state', () => {
    const html = sanitizePastedHTML([
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true">Done</li></ul>',
      '<ul data-type="notTaskList"><li data-type="taskItem" data-checked="maybe">Invalid state</li></ul>',
    ].join(''));

    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('data-type="taskItem"');
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('Invalid state');
    expect(html).not.toContain('notTaskList');
    expect(html).not.toContain('maybe');
  });

  it('round-trips sanitized rich text, plain text, tables, lists, and KB blocks through the Tiptap schema', () => {
    const richTextEditor = insertSanitizedIntoEditor([
      '<h2 onclick="alert(1)">Heading</h2>',
      '<p><strong>Bold</strong> <a href="https://example.com">Link</a></p>',
      '<script>alert(1)</script>',
    ].join(''));
    expect(richTextEditor.getHTML()).toContain('<h2>Heading</h2>');
    expect(richTextEditor.getHTML()).toContain('href="https://example.com/"');
    expectNoExecutableHtml(richTextEditor.getHTML());

    const plainTextEditor = insertSanitizedIntoEditor('hello');
    expect(plainTextEditor.getJSON().content?.[0]?.type).toBe('paragraph');
    expect(plainTextEditor.getText()).toBe('hello');

    const tableEditor = insertSanitizedIntoEditor([
      '<table><tbody><tr><td><p>Cell A</p></td><td>Cell B</td></tr></tbody></table>',
      '<iframe src="https://example.com"></iframe>',
    ].join(''));
    expect(editorNodeNames(tableEditor)).toContain('table');
    expect(tableEditor.getText()).toContain('Cell A');
    expect(tableEditor.getText()).toContain('Cell B');
    expectNoExecutableHtml(tableEditor.getHTML());

    const nestedListEditor = insertSanitizedIntoEditor(
      '<ol><li>One<ul><li><strong>Two</strong><ol><li>Three</li></ol></li></ul></li></ol>',
    );
    expect(editorNodeNames(nestedListEditor)).toContain('orderedList');
    expect(editorNodeNames(nestedListEditor)).toContain('bulletList');
    expect(nestedListEditor.getText()).toContain('Three');

    const kbBlocksEditor = insertSanitizedIntoEditor([
      '<aside data-kb-callout data-kb-callout-variant="warning"><div data-kb-callout-content><p>Callout body</p></div></aside>',
      '<div data-kb-tabs><section data-kb-tab-item data-kb-tab-id="tab_1" data-kb-tab-label="Intro">',
      '<h3 data-kb-tab-label-static>Intro</h3><div data-kb-tab-panel><p>Tab body</p></div></section></div>',
      '<div data-kb-accordion><details data-kb-accordion-item data-kb-accordion-id="acc_1" data-kb-accordion-title="FAQ" open>',
      '<summary data-kb-accordion-title-static>FAQ</summary><div data-kb-accordion-panel><p>Answer</p></div></details></div>',
      '<object data="unsafe.swf"></object>',
    ].join(''));
    const kbNodeNames = editorNodeNames(kbBlocksEditor);
    expect(kbNodeNames).toContain('callout');
    expect(kbNodeNames).toContain('tabs');
    expect(kbNodeNames).toContain('tabItem');
    expect(kbNodeNames).toContain('accordion');
    expect(kbNodeNames).toContain('accordionItem');
    expect(kbBlocksEditor.getText()).toContain('Callout body');
    expect(kbBlocksEditor.getText()).toContain('Tab body');
    expect(kbBlocksEditor.getText()).toContain('Answer');
    expectNoExecutableHtml(kbBlocksEditor.getHTML());
  });

  it('converts simple text divs to paragraphs and removes empty wrappers', () => {
    const html = sanitizePastedHTML(
      '<div><span></span><span>Keep me</span></div><p><span></span></p>',
    );

    expect(html).toContain('<p>Keep me</p>');
    expect(html).not.toContain('<span></span>');
    expect(html).not.toContain('<p></p>');
    expect(html).not.toContain('<div>');
  });

  it('handles malformed HTML without throwing or leaking unsafe content', () => {
    expect(() =>
      sanitizePastedHTML('<p><strong>Open<script>alert(1)</script><a href="vbscript:msgbox(1)">bad'),
    ).not.toThrow();

    const html = sanitizePastedHTML(
      '<p><strong>Open<script>alert(1)</script><a href="vbscript:msgbox(1)">bad',
    );

    expect(html).toContain('<strong>');
    expect(html).toContain('Open');
    expect(html).toContain('bad');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('vbscript:');
  });

  it('does not crash if NodeFilter is unavailable on the document window', () => {
    const view = document.defaultView;
    const descriptor = view
      ? Object.getOwnPropertyDescriptor(view, 'NodeFilter')
      : undefined;

    if (view && (!descriptor || descriptor.configurable)) {
      Object.defineProperty(view, 'NodeFilter', {
        configurable: true,
        value: undefined,
      });
    }

    try {
      expect(() => sanitizePastedHTML('<!--secret--><p>Keep</p>')).not.toThrow();
      expect(sanitizePastedHTML('<!--secret--><p>Keep</p>')).toContain('Keep');
    } finally {
      if (view && descriptor) {
        Object.defineProperty(view, 'NodeFilter', descriptor);
      }
    }
  });

  it('returns unsupported-environment when DOMParser is unavailable', () => {
    vi.stubGlobal('DOMParser', undefined);

    expect(sanitizePastedHTMLWithResult('<p>Text</p>')).toEqual({
      ok: false,
      html: '',
      reason: 'unsupported-environment',
    });
    expect(sanitizePastedHTML('<p>Text</p>')).toBe('');
  });

  it('rejects pasted HTML that exceeds the maximum string length', () => {
    const oversizedHtml = `<p>${'x'.repeat(1_000_001)}</p>`;
    const result = sanitizePastedHTMLWithResult(oversizedHtml);

    expect(result).toEqual({ ok: false, html: '', reason: 'too-large' });
    expect(sanitizePastedHTML(oversizedHtml)).toBe('');
  });

  it('rejects pasted documents with too many DOM nodes', () => {
    const result = sanitizePastedHTMLWithResult('<span></span>'.repeat(20_001));

    expect(result).toEqual({ ok: false, html: '', reason: 'too-many-nodes' });
  });

  it('does not crash on extremely deeply nested HTML', () => {
    const nestedHtml = `${'<div>'.repeat(120)}Deep safe text${'</div>'.repeat(120)}`;
    let result = sanitizePastedHTMLWithResult('');

    expect(() => {
      result = sanitizePastedHTMLWithResult(nestedHtml);
    }).not.toThrow();
    expect(result).toEqual({ ok: false, html: '', reason: 'too-deep' });
  });

  it('returns parse-error if DOM parsing throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    class ThrowingDOMParser {
      parseFromString(): Document {
        throw new Error('DOMParser failed');
      }
    }

    vi.stubGlobal('DOMParser', ThrowingDOMParser);

    expect(sanitizePastedHTMLWithResult('<p>Broken</p>')).toEqual({
      ok: false,
      html: '',
      reason: 'parse-error',
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('sanitizes a large Word-like paste without throwing in a generous regression window', () => {
    const wordLikeHtml = Array.from({ length: 600 }, (_, index) => [
      '<p class="MsoNormal" style="margin-top:0pt;line-height:1.38">',
      '<span style="font-size:11pt;color:#000000;background-color:transparent;font-weight:700;white-space:pre-wrap">',
      `Paragraph ${index}`,
      '</span></p>',
    ].join('')).join('');
    const startedAt = performance.now();

    const result = sanitizePastedHTMLWithResult(wordLikeHtml);
    const elapsedMs = performance.now() - startedAt;

    expect(result.ok).toBe(true);
    expect(elapsedMs).toBeLessThan(5_000);
    if (result.ok) {
      expect(result.html).toContain('Paragraph 599');
      expect(result.html).not.toContain('MsoNormal');
      expect(result.html).not.toContain('white-space');
    }
  });

  it('feeds sanitized HTML through the Tiptap paste pipeline', () => {
    const editor = createEditor();
    editor.commands.selectAll();

    pasteHTML(
      editor,
      [
        '<h2 onclick="alert(1)">Heading</h2>',
        '<p><a href="https://example.com" target="_blank">Safe link</a></p>',
        '<p><a href="javascript:alert(1)">Unsafe link</a></p>',
        '<ul><li>Parent<ul><li><strong>Child</strong></li></ul></li></ul>',
        '<table><tbody><tr><td><i>Cell</i></td></tr></tbody></table>',
        '<script>alert(1)</script>',
      ].join(''),
    );

    const html = editor.getHTML();
    expect(html).toContain('<h2>Heading</h2>');
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('Safe link');
    expect(html).toContain('Unsafe link');
    expect(html).toContain('<ul data-list-style="disc"');
    expect(html).toContain('<strong>Child</strong>');
    expect(html).toContain('<table');
    expect(html).toContain('<em>Cell</em>');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<script');
  });

  it('reports real PasteSanitizer failures without crashing or mutating the editor', () => {
    const onSanitizeFailure = vi.fn();
    const editor = createEditor('<p>Keep me</p>', {
      pasteSanitizer: { onSanitizeFailure },
    });
    editor.commands.selectAll();

    expect(() =>
      pasteHTML(editor, `<p>${'x'.repeat(1_000_001)}</p>`, 'fallback text'),
    ).not.toThrow();

    expect(onSanitizeFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'too-large' }),
      expect.objectContaining({ reason: 'too-large', source: 'text/html' }),
    );
    expect(editor.getText()).toBe('Keep me');

    onSanitizeFailure.mockClear();
    editor.commands.selectAll();

    expect(() =>
      pasteHTML(
        editor,
        `${'<div>'.repeat(120)}Deep safe text${'</div>'.repeat(120)}`,
      ),
    ).not.toThrow();

    expect(onSanitizeFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'too-deep' }),
      expect.objectContaining({ reason: 'too-deep', source: 'text/html' }),
    );
    expect(editor.getText()).toBe('Keep me');
  });

  it('does not report PasteSanitizer failures for valid HTML, empty HTML, or plain text', () => {
    const onSanitizeFailure = vi.fn();
    const editor = createEditor('<p>Replace me</p>', {
      pasteSanitizer: { onSanitizeFailure },
    });
    editor.commands.selectAll();

    const validHtmlEvent = pasteHTML(
      editor,
      '<p><strong>Clean</strong> <a href="https://example.com">link</a></p>',
      'Clean link',
    );

    expect(validHtmlEvent.defaultPrevented).toBe(true);
    expect(editor.getHTML()).toContain('<strong>Clean</strong>');
    expect(editor.getHTML()).toContain('href="https://example.com/"');
    expect(onSanitizeFailure).not.toHaveBeenCalled();

    const emptyHtmlEvent = pasteHTML(editor, '', '');
    expect(emptyHtmlEvent.defaultPrevented).toBe(false);
    expect(onSanitizeFailure).not.toHaveBeenCalled();

    expect(() => pasteHTML(editor, '', 'hello')).not.toThrow();
    expect(onSanitizeFailure).not.toHaveBeenCalled();
  });

  it('sanitizes HTML-looking plain text without treating it as a failure', () => {
    const onSanitizeFailure = vi.fn();
    const editor = createEditor('<p>Replace me</p>', {
      pasteSanitizer: { onSanitizeFailure },
    });
    editor.commands.selectAll();

    const event = pasteHTML(
      editor,
      '',
      '<h2 onclick="alert(1)">Plain source</h2><script>alert(1)</script>',
    );

    expect(event.defaultPrevented).toBe(true);
    expect(editor.getHTML()).toContain('<h2>Plain source</h2>');
    expect(editor.getHTML()).not.toContain('onclick');
    expect(editor.getHTML()).not.toContain('<script');
    expect(onSanitizeFailure).not.toHaveBeenCalled();
  });
});
