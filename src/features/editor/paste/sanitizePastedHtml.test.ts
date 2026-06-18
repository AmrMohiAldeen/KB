import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '../extensions';
import { sanitizePastedHTML } from './sanitizePastedHtml';

const editors: Editor[] = [];

function pasteHTML(editor: Editor, html: string): void {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) => (type === 'text/html' ? html : ''),
    },
  });
  editor.view.dom.dispatchEvent(event);
}

function createEditor(content = '<p>Replace me</p>'): Editor {
  const element = document.createElement('div');
  document.body.append(element);

  const editor = new Editor({
    element,
    extensions: getEditorExtensions(),
    content,
  });

  editors.push(editor);
  return editor;
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

function sanitizedFragment(html: string): HTMLDivElement {
  const container = document.createElement('div');
  container.innerHTML = sanitizePastedHTML(html);
  return container;
}

describe('sanitizePastedHTML', () => {
  it('removes scripts, event handlers, unsafe wrappers, and unknown dangerous tags', () => {
    const html = sanitizePastedHTML([
      '<p onclick="alert(1)" onmouseover="alert(2)">Safe text</p>',
      '<script>alert(1)</script>',
      '<iframe src="https://example.com"></iframe>',
      '<svg onload="alert(3)"><circle></circle></svg>',
      '<form><input value="hidden"></form>',
    ].join(''));

    expect(html).toContain('<p>Safe text</p>');
    expect(html).not.toContain('<script');
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

  it('preserves safe absolute, mailto, and relative links', () => {
    const html = sanitizePastedHTML([
      '<p>',
      '<a href="https://example.com/docs" target="_blank">External</a>',
      '<a href="mailto:team@example.com">Email</a>',
      '<a href="/kb/article#section">Internal</a>',
      '</p>',
    ].join(''));

    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="mailto:team@example.com"');
    expect(html).toContain('href="/kb/article#section"');
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
    expect(html).toContain('<h4>Deep heading</h4>');
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
      '<div data-random="tracking" data-kb-unknown="x" class="wrapper"><p>Wrapped</p></div>',
    ].join(''));

    expect(html).toContain('data-kb-callout=""');
    expect(html).toContain('data-kb-callout-variant="tip"');
    expect(html).toContain('data-kb-callout-content=""');
    expect(html).toContain('<p>Tip body</p>');
    expect(html).toContain('<p>Wrapped</p>');
    expect(html).not.toContain('contenteditable');
    expect(html).not.toContain('draggable');
    expect(html).not.toContain('class=');
    expect(html).not.toContain('data-random');
    expect(html).not.toContain('data-kb-unknown');
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

  it('rejects pasted HTML that exceeds the maximum string length', () => {
    const html = sanitizePastedHTML(`<p>${'x'.repeat(1_000_001)}</p>`);

    expect(html).toBe('');
  });

  it('rejects pasted documents with too many DOM nodes', () => {
    const html = sanitizePastedHTML('<span></span>'.repeat(20_001));

    expect(html).toBe('');
  });

  it('does not crash on extremely deeply nested HTML', () => {
    const nestedHtml = `${'<div>'.repeat(120)}Deep safe text${'</div>'.repeat(120)}`;
    let html = '';

    expect(() => {
      html = sanitizePastedHTML(nestedHtml);
    }).not.toThrow();
    expect(html).not.toContain('Deep safe text');
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
});
