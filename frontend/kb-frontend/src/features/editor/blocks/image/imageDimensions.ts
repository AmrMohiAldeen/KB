export const MIN_IMAGE_WIDTH_PX = 24;
export const DEFAULT_IMAGE_OFFSET_PCT = 0;

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function parsePixelValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  const withoutUnit = trimmed.endsWith('px') ? trimmed.slice(0, -2) : trimmed;
  const parsed = Number(withoutUnit);

  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeImageWidth(value: unknown): number | null {
  const parsed = parsePixelValue(value);

  return parsed != null && parsed > 0
    ? Math.max(MIN_IMAGE_WIDTH_PX, Math.round(parsed))
    : null;
}

export function clampImageWidthPx(
  value: number,
  maxWidthPx = Number.POSITIVE_INFINITY,
): number {
  const finiteMax =
    Number.isFinite(maxWidthPx) && maxWidthPx > 0
      ? Math.max(MIN_IMAGE_WIDTH_PX, maxWidthPx)
      : Number.POSITIVE_INFINITY;

  return Number.isFinite(value)
    ? Math.max(MIN_IMAGE_WIDTH_PX, Math.min(finiteMax, Math.round(value)))
    : MIN_IMAGE_WIDTH_PX;
}

export function normalizeImageHeight(value: unknown): number | null {
  const parsed = parsePixelValue(value);

  return parsed != null && parsed > 0 ? Math.round(parsed) : null;
}

export function readImageWidthPx(image: HTMLImageElement): number {
  const datasetWidth = normalizeImageWidth(image.dataset.imageWidth);
  if (datasetWidth != null) return datasetWidth;

  const widthAttribute = normalizeImageWidth(image.getAttribute('width'));
  if (widthAttribute != null) return widthAttribute;

  const styleWidth = normalizeImageWidth(image.style.width);
  if (styleWidth != null) return styleWidth;

  const rectWidth = image.getBoundingClientRect().width;
  if (Number.isFinite(rectWidth) && rectWidth > 0) {
    return Math.round(rectWidth);
  }

  return MIN_IMAGE_WIDTH_PX;
}

export function applyImageWidthPreview(
  image: HTMLImageElement,
  value: number,
  maxWidthPx?: number,
): number {
  const width = clampImageWidthPx(value, maxWidthPx);

  image.dataset.imageWidth = String(width);
  image.style.width = `${width}px`;

  return width;
}

export function maxImageOffsetPct(
  imageWidthPx: number,
  containerWidthPx: number,
): number {
  if (!Number.isFinite(containerWidthPx) || containerWidthPx <= 0) return 0;

  const imageWidthPct = (Math.max(0, imageWidthPx) / containerWidthPx) * 100;
  return Math.max(0, 100 - imageWidthPct);
}

export function normalizeImageOffsetPct(
  value: unknown,
  imageWidthPx: number,
  containerWidthPx: number,
): number {
  const numericValue = Number(value);
  const maxOffset = maxImageOffsetPct(imageWidthPx, containerWidthPx);

  return Number.isFinite(numericValue)
    ? Math.max(DEFAULT_IMAGE_OFFSET_PCT, Math.min(maxOffset, numericValue))
    : DEFAULT_IMAGE_OFFSET_PCT;
}

export function readImageOffsetPct(
  image: HTMLImageElement,
  container: HTMLElement,
  imageWidthPx = readImageWidthPx(image),
): number {
  const containerWidthPx = container.getBoundingClientRect().width;
  const datasetOffset = Number(image.dataset.imageOffsetPct);
  if (Number.isFinite(datasetOffset)) {
    return normalizeImageOffsetPct(datasetOffset, imageWidthPx, containerWidthPx);
  }

  const styleMatch = image.style.marginLeft.match(/^(\d+(?:\.\d+)?)%$/);
  if (styleMatch) {
    return normalizeImageOffsetPct(Number(styleMatch[1]), imageWidthPx, containerWidthPx);
  }

  const imageRect = image.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const visualOffsetPct =
    containerRect.width > 0
      ? ((imageRect.left - containerRect.left) / containerRect.width) * 100
      : DEFAULT_IMAGE_OFFSET_PCT;

  return normalizeImageOffsetPct(visualOffsetPct, imageWidthPx, containerWidthPx);
}

export function applyImageOffsetPct(
  image: HTMLImageElement,
  value: number,
  imageWidthPx: number,
  containerWidthPx: number,
): number {
  const offset = roundToTenth(
    normalizeImageOffsetPct(value, imageWidthPx, containerWidthPx),
  );
  const cssOffset = `${offset}%`;

  image.dataset.imageOffsetPct = String(offset);
  image.style.setProperty('--image-offset-pct', cssOffset);
  image.style.marginLeft = cssOffset;

  return offset;
}
