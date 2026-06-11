import type { JSONContent } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type EditorChangeHandler,
  useDebouncedEditorUpdate,
} from "./useDebouncedEditorUpdate";

type ScheduleChange = (editor: Editor) => void;

function Harness({
  onChange,
  onReady,
  delayMs,
}: {
  onChange: EditorChangeHandler;
  onReady: (scheduleChange: ScheduleChange) => void;
  delayMs: number;
}) {
  const scheduleChange = useDebouncedEditorUpdate(onChange, delayMs);

  useEffect(() => {
    onReady(scheduleChange);
  }, [onReady, scheduleChange]);

  return null;
}

describe("useDebouncedEditorUpdate", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    vi.useRealTimers();
  });

  const renderHarness = (onChange: EditorChangeHandler, delayMs = 500) => {
    let scheduleChange: ScheduleChange | undefined;

    act(() => {
      root?.render(
        createElement(Harness, {
          delayMs,
          onChange,
          onReady: (schedule) => {
            scheduleChange = schedule;
          },
        }),
      );
    });

    return (editor: Editor) => scheduleChange?.(editor);
  };

  it("serializes only once after a burst of editor updates", () => {
    const content: JSONContent = { type: "doc", content: [] };
    const getJSON = vi.fn(() => content);
    const onChange = vi.fn();
    const editor = { getJSON, isDestroyed: false } as unknown as Editor;
    const scheduleChange = renderHarness(onChange);

    act(() => {
      scheduleChange(editor);
      scheduleChange(editor);
      scheduleChange(editor);
      vi.advanceTimersByTime(499);
    });

    expect(getJSON).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));

    expect(getJSON).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(content);
  });

  it("flushes the latest pending update when the editor unmounts", () => {
    const content: JSONContent = { type: "doc", content: [] };
    const getJSON = vi.fn(() => content);
    const onChange = vi.fn();
    const editor = { getJSON, isDestroyed: false } as unknown as Editor;
    const scheduleChange = renderHarness(onChange);

    act(() => {
      scheduleChange(editor);
      root?.unmount();
    });
    root = null;

    expect(getJSON).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(content);
  });
});
