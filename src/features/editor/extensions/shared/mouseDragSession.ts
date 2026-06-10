export interface MouseDragSessionOptions {
  window: Window;
  onMove: (event: MouseEvent) => void;
  onEnd: () => void;
}

export function startMouseDragSession({
  window,
  onMove,
  onEnd,
}: MouseDragSessionOptions) {
  let active = true;

  const cleanup = () => {
    if (!active) return;
    active = false;
    window.removeEventListener('mousemove', handleMove);
    window.removeEventListener('mouseup', handleEnd);
    window.removeEventListener('blur', handleEnd);
  };

  const handleMove = (event: MouseEvent) => {
    onMove(event);
  };

  const handleEnd = () => {
    cleanup();
    onEnd();
  };

  window.addEventListener('mousemove', handleMove);
  window.addEventListener('mouseup', handleEnd);
  window.addEventListener('blur', handleEnd);

  return cleanup;
}
