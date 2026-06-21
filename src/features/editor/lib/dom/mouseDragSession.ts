export type MouseDragSession = {
  cancel: () => void;
};

export type MouseDragSessionOptions = {
  window: Window;
  onMove: (event: MouseEvent) => void;
  onCommit: (event: MouseEvent) => void;
  onCancel: () => void;
};

export function startMouseDragSession({
  window,
  onMove,
  onCommit,
  onCancel,
}: MouseDragSessionOptions): MouseDragSession {
  let active = true;

  const cleanup = () => {
    if (!active) return false;

    active = false;
    window.removeEventListener('mousemove', handleMove);
    window.removeEventListener('mouseup', handleCommit);
    window.removeEventListener('blur', handleCancel);
    window.removeEventListener('keydown', handleKeyDown);
    return true;
  };

  const handleMove = (event: MouseEvent) => {
    if (active) onMove(event);
  };

  const handleCommit = (event: MouseEvent) => {
    if (cleanup()) onCommit(event);
  };

  const handleCancel = () => {
    if (cleanup()) onCancel();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') handleCancel();
  };

  window.addEventListener('mousemove', handleMove);
  window.addEventListener('mouseup', handleCommit);
  window.addEventListener('blur', handleCancel);
  window.addEventListener('keydown', handleKeyDown);

  return {
    cancel: handleCancel,
  };
}
