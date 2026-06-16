import { describe, expect, it, vi } from 'vitest';
import { startMouseDragSession } from './mouseDragSession';

describe('startMouseDragSession', () => {
  it('forwards movement and ends once on mouseup', () => {
    const onMove = vi.fn();
    const onCommit = vi.fn();
    const onCancel = vi.fn();

    startMouseDragSession({ window, onMove, onCommit, onCancel });

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 42 }));
    window.dispatchEvent(new MouseEvent('mouseup'));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 84 }));
    window.dispatchEvent(new MouseEvent('mouseup'));

    expect(onMove).toHaveBeenCalledOnce();
    expect(onMove.mock.calls[0][0].clientX).toBe(42);
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels and cleans up when the window loses focus', () => {
    const onMove = vi.fn();
    const onCommit = vi.fn();
    const onCancel = vi.fn();

    startMouseDragSession({ window, onMove, onCommit, onCancel });
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new MouseEvent('mousemove'));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCommit).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('supports explicit cancellation during plugin cleanup', () => {
    const onCancel = vi.fn();
    const session = startMouseDragSession({
      window,
      onMove: vi.fn(),
      onCommit: vi.fn(),
      onCancel,
    });

    session.cancel();
    session.cancel();

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('cancels when Escape is pressed', () => {
    const onCancel = vi.fn();
    startMouseDragSession({
      window,
      onMove: vi.fn(),
      onCommit: vi.fn(),
      onCancel,
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    window.dispatchEvent(new MouseEvent('mouseup'));

    expect(onCancel).toHaveBeenCalledOnce();
  });
});
