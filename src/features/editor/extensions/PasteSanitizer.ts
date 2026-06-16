import { Extension } from '@tiptap/core';
import { sanitizePastedHTML } from '../paste/sanitizePastedHtml';

export const PasteSanitizer = Extension.create({
  name: 'pasteSanitizer',

  transformPastedHTML(html) {
    return sanitizePastedHTML(html);
  },
});
