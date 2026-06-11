import { afterEach } from 'vitest';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: ResizeObserverStub,
});

Object.defineProperty(window, 'requestAnimationFrame', {
  configurable: true,
  value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 0),
});

Object.defineProperty(window, 'cancelAnimationFrame', {
  configurable: true,
  value: (handle: number) => window.clearTimeout(handle),
});

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  document.body.replaceChildren();
});
