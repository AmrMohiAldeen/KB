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

  it("does not serialize a pending update after the editor is destroyed", () => {
    const getJSON = vi.fn();
    const onChange = vi.fn();
    const editor = { getJSON, isDestroyed: false } as unknown as Editor;
    const scheduleChange = renderHarness(onChange);

    act(() => {
      scheduleChange(editor);
      (editor as unknown as { isDestroyed: boolean }).isDestroyed = true;
      vi.advanceTimersByTime(500);
    });

    expect(getJSON).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses the latest change handler for a pending update", () => {
    const content: JSONContent = { type: "doc", content: [] };
    const firstOnChange = vi.fn();
    const latestOnChange = vi.fn();
    const editor = {
      getJSON: vi.fn(() => content),
      isDestroyed: false,
    } as unknown as Editor;
    const scheduleChange = renderHarness(firstOnChange);

    act(() => scheduleChange(editor));
    act(() => {
      root?.render(
        createElement(Harness, {
          delayMs: 500,
          onChange: latestOnChange,
          onReady: () => {},
        }),
      );
    });
    act(() => vi.advanceTimersByTime(500));

    expect(firstOnChange).not.toHaveBeenCalled();
    expect(latestOnChange).toHaveBeenCalledWith(content);
  });

  it("can emit JSON and rendered forms immediately for an external autosave coordinator", () => {
    const content: JSONContent = { type: "doc", content: [] };
    const onChange = vi.fn();
    const editor = {
      getJSON: vi.fn(() => content),
      getHTML: vi.fn(() => "<p></p>"),
      getText: vi.fn(() => ""),
      isDestroyed: false,
    } as unknown as Editor;
    const scheduleChange = renderHarness(onChange, 0);

    act(() => scheduleChange(editor));

    expect(onChange).toHaveBeenCalledWith(content, "<p></p>", "");
  });
});
