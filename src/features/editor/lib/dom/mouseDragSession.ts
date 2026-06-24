export type MouseDragSession = {
  cancel: () => void;
};

export type MouseDragSessionOptions = {
  window: Window;
  onMove: (event: MouseEvent) => void;
  onCommit: (event: MouseEvent) => void;
  onCancel: () => void;
  cancelOnWindowBlur?: boolean;
};

export function startMouseDragSession({
  window,
  onMove,
  onCommit,
  onCancel,
  cancelOnWindowBlur = true,
}: MouseDragSessionOptions): MouseDragSession {
  let active = true;

  const cleanup = () => {
    if (!active) return false;

    active = false;
    window.removeEventListener('mousemove', handleMove);
    window.removeEventListener('mouseup', handleCommit);
    if (cancelOnWindowBlur) {
      window.removeEventListener('blur', handleCancel);
    }
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
  if (cancelOnWindowBlur) {
    window.addEventListener('blur', handleCancel);
  }
  window.addEventListener('keydown', handleKeyDown);

  return {
    cancel: handleCancel,
  };
}
