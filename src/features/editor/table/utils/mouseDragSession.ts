export type MouseDragSession = {
  cancel: () => void;
};

export type MouseDragSessionOptions = {
  window: Window;
  onMove: (event: MouseEvent) => void;
  onCommit: () => void;
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
    return true;
  };

  const handleMove = (event: MouseEvent) => {
    if (active) onMove(event);
  };

  const handleCommit = () => {
    if (cleanup()) onCommit();
  };

  const handleCancel = () => {
    if (cleanup()) onCancel();
  };

  window.addEventListener('mousemove', handleMove);
  window.addEventListener('mouseup', handleCommit);
  window.addEventListener('blur', handleCancel);

  return {
    cancel: handleCancel,
  };
}
