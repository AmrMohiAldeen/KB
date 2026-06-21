export const BLOCK_IMAGE_NODE_NAME = 'image';
export const INLINE_IMAGE_NODE_NAME = 'inlineImage';

export const IMAGE_NODE_NAMES = new Set<string>([
  BLOCK_IMAGE_NODE_NAME,
  INLINE_IMAGE_NODE_NAME,
]);

export type ImageDisplayMode = 'block' | 'inline';

