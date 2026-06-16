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

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe('sanitizePastedHTML', () => {
  it('removes unsafe and Word-only markup while preserving supported formatting', () => {
    const html = sanitizePastedHTML([
      '<!--[if gte mso 9]><xml>metadata</xml><![endif]-->',
      '<p class="MsoNormal" onclick="alert(1)" ',
      'style="color: rgb(255, 0, 0); mso-bidi-font-weight: bold">',
      '<strong>Formatted</strong> ',
      '<a href="javascript:alert(1)" target="_blank">unsafe</a></p>',
      '<script>alert(1)</script>',
      '<table data-table-width-pct="70"><tbody><tr><td>Cell</td></tr></tbody></table>',
    ].join(''));

    expect(html).toContain('<strong>Formatted</strong>');
    expect(html).toContain('color: rgb(255, 0, 0)');
    expect(html).toContain('data-table-width-pct="70"');
    expect(html).not.toContain('Mso');
    expect(html).not.toContain('mso-');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<xml');
  });

  it('converts consecutive Word list paragraphs into semantic lists', () => {
    const html = sanitizePastedHTML([
      '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">',
      '<span style="mso-list:Ignore">1.<span>&nbsp;&nbsp;</span></span>',
      '<b>First item</b></p>',
      '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">',
      '<span style="mso-list:Ignore">2.<span>&nbsp;&nbsp;</span></span>',
      'Second item</p>',
    ].join(''));

    expect(html).toContain('<ol>');
    expect(html).toContain('<li><b>First item</b></li>');
    expect(html).toContain('<li>Second item</li>');
    expect(html).not.toContain('MsoListParagraph');
    expect(html).not.toContain('mso-list');
  });

  it('keeps safe links and custom export data attributes', () => {
    const html = sanitizePastedHTML(
      '<aside data-kb-callout data-kb-callout-variant="tip">' +
        '<a href="https://example.com" target="_blank">Example</a></aside>',
    );

    expect(html).toContain('data-kb-callout=""');
    expect(html).toContain('data-kb-callout-variant="tip"');
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('preserves percentage table widths and makes pixel-width tables full width', () => {
    const html = sanitizePastedHTML(
      '<table style="width: 65%"><tr><td>A</td></tr></table>' +
        '<table width="480"><tr><td>B</td></tr></table>',
    );

    expect(html).toContain('data-table-width-pct="65"');
    expect(html).toContain('style="width: 65%; margin-left: 0%;"');
    expect(html).toContain('data-table-width-pct="100"');
    expect(html).not.toContain('width="480"');
  });

  it('feeds normalized Word lists, links, tables, and marks into the editor schema', () => {
    const element = document.createElement('div');
    document.body.append(element);
    const editor = new Editor({
      element,
      extensions: getEditorExtensions(),
      content: '<p>Replace me</p>',
    });
    editors.push(editor);
    editor.commands.selectAll();

    pasteHTML(
      editor,
      [
        '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">',
        '<span style="mso-list:Ignore">1.<span>&nbsp;</span></span>',
        '<b>Word item</b></p>',
        '<p><a href="https://example.com">Safe link</a></p>',
        '<table><tbody><tr><td><i>Cell</i></td></tr></tbody></table>',
      ].join(''),
    );

    const html = editor.getHTML();
    expect(html).toContain('<ol data-list-style="decimal"');
    expect(html).toContain('<strong>Word item</strong>');
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('<table');
    expect(html).toContain('<em>Cell</em>');
  });
});
