"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { ContentBlockPicker } from "../../contentBlocks/toolbar";
import { insertTable } from "../../table/commands/tableCommands";
import { TableControls, TableCreationPicker } from "../../table/toolbar";
import { LinkControl } from "../LinkControl";
import {
  Divider,
  DropdownItem,
  ToolbarButton,
  ToolbarDropdown,
} from "./ToolbarPrimitives";
import { RgbColorItem } from "./RgbColorItem";
import {
  DEFAULT_FONT_SIZE,
  FONT_FAMILIES,
  FONT_SIZES,
  HEADING_OPTIONS,
  HIGHLIGHT_COLORS,
  TEXT_COLORS,
  applyFontSize,
  changeFontSize,
  getFontFamilyLabel,
  getTextSizeLabel,
} from "./toolbarOptions";

export interface EditorToolbarProps {
  editor: Editor;
}

export default function EditorToolbar({ editor }: EditorToolbarProps) {
  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      isEditable: currentEditor.isEditable,

      canUndo: currentEditor.can().undo(),
      canRedo: currentEditor.can().redo(),
      canBlockquote: currentEditor.can().toggleBlockquote(),
      canCodeBlock: currentEditor.can().toggleCodeBlock(),
      canBold: currentEditor.can().toggleBold(),
      canItalic: currentEditor.can().toggleItalic(),
      canStrike: currentEditor.can().toggleStrike(),
      canCode: currentEditor.can().toggleCode(),

      isHeading: currentEditor.isActive("heading"),
      isParagraph: currentEditor.isActive("paragraph"),
      isHeading1: currentEditor.isActive("heading", { level: 1 }),
      isHeading2: currentEditor.isActive("heading", { level: 2 }),
      isHeading3: currentEditor.isActive("heading", { level: 3 }),

      isBulletList: currentEditor.isActive("bulletList"),
      isOrderedList: currentEditor.isActive("orderedList"),
      isTaskList: currentEditor.isActive("taskList"),
      isBlockquote: currentEditor.isActive("blockquote"),
      isCodeBlock: currentEditor.isActive("codeBlock"),

      isBold: currentEditor.isActive("bold"),
      isItalic: currentEditor.isActive("italic"),
      isStrike: currentEditor.isActive("strike"),
      isCode: currentEditor.isActive("code"),
      isUnderline: currentEditor.isActive("underline"),

      textColor: String(currentEditor.getAttributes("textStyle").color ?? ""),
      hasTextColor: Boolean(currentEditor.getAttributes("textStyle").color),

      isHighlight: currentEditor.isActive("highlight"),
      highlightColor: String(currentEditor.getAttributes("highlight").color ?? ""),

      isLink: currentEditor.isActive("link"),
      linkHref: String(currentEditor.getAttributes("link").href ?? ""),

      isSuperscript: currentEditor.isActive("superscript"),
      isSubscript: currentEditor.isActive("subscript"),

      alignLeft: currentEditor.isActive({ textAlign: "left" }),
      alignCenter: currentEditor.isActive({ textAlign: "center" }),
      alignRight: currentEditor.isActive({ textAlign: "right" }),
      alignJustify: currentEditor.isActive({ textAlign: "justify" }),
      lineHeight: editor.getAttributes('textStyle').lineHeight ?? 'normal',
      
      fontFamily: String(currentEditor.getAttributes("textStyle").fontFamily ?? ""),
      fontSize: String(currentEditor.getAttributes("textStyle").fontSize ?? ""),
    }),
  });

  if (!toolbarState.isEditable) return null;

  const fontFamilyLabel = getFontFamilyLabel(toolbarState.fontFamily);
  const textSizeLabel = getTextSizeLabel(toolbarState);

  return (
    <>
      <div
        role="toolbar"
        aria-label="Editor formatting"
        className="flex flex-wrap items-center gap-0.5 rounded-t-lg border-b border-gray-200 bg-white p-1.5 shadow-sm"
      >
        <ToolbarButton
          title="Undo"
          disabled={!toolbarState.canUndo}
          onActivate={() => editor.chain().focus().undo().run()}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </ToolbarButton>

        <ToolbarButton
          title="Redo"
          disabled={!toolbarState.canRedo}
          onActivate={() => editor.chain().focus().redo().run()}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
          </svg>
        </ToolbarButton>

        <Divider />

        <ToolbarDropdown
          title="Font family"
          label={<span className="w-24 truncate text-left">{fontFamilyLabel}</span>}
          isActive={Boolean(toolbarState.fontFamily)}
          menuClassName="w-32"
        >
          {FONT_FAMILIES.map((font) => (
            <DropdownItem
              key={`${font.label}-${font.value}`}
              onActivate={() => {
                if (font.value) {
                  editor.chain().focus().setFontFamily(font.value).run();
                } else {
                  editor.chain().focus().unsetFontFamily().run();
                }
              }}
              isActive={
                font.value
                  ? toolbarState.fontFamily === font.value
                  : !toolbarState.fontFamily
              }
            >
              {font.label}
            </DropdownItem>
          ))}
        </ToolbarDropdown>

        <ToolbarDropdown
          title="Text size"
          label={<span className="w-10 truncate text-left">{textSizeLabel}</span>}
          isActive={toolbarState.isHeading || Boolean(toolbarState.fontSize)}
          menuClassName="w-26"
        >
          <div className="px-2 py-0.5 text-[11px] font-medium text-gray-500">
            Headings
          </div>

          <DropdownItem
            onActivate={() => editor.chain().focus().setParagraph().unsetFontSize().run()}
            isActive={toolbarState.isParagraph && !toolbarState.fontSize}
          >
            Normal text
          </DropdownItem>

          {HEADING_OPTIONS.map((heading) => {
            const isActive =
              heading.level === 1
                ? toolbarState.isHeading1
                : heading.level === 2
                  ? toolbarState.isHeading2
                  : toolbarState.isHeading3;

            return (
              <DropdownItem
                key={heading.level}
                onActivate={() =>
                  editor
                    .chain()
                    .focus()
                    .unsetFontSize()
                    .setHeading({ level: heading.level })
                    .run()
                }
                isActive={isActive}
              >
                {heading.label}
              </DropdownItem>
            );
          })}

          <div className="my-1 border-t border-gray-200" />

          <div className="px-2 py-0.5 text-[11px] font-medium text-gray-500">
            Font size
          </div>

          {FONT_SIZES.map((size) => {
            const sizeNumber = Number(size.label);
            const isDefaultSize = sizeNumber === DEFAULT_FONT_SIZE;

            return (
              <DropdownItem
                key={size.value}
                onActivate={() => applyFontSize(editor, sizeNumber)}
                isActive={
                  !toolbarState.isHeading &&
                  (toolbarState.fontSize === size.value ||
                    (!toolbarState.fontSize && isDefaultSize))
                }
              >
                {size.label}
              </DropdownItem>
            );
          })}
        </ToolbarDropdown>

        <ToolbarButton
          title="Decrease font size (Ctrl+Shift+<)"
          onActivate={() => changeFontSize(editor, -1)}
        >
          <span className="font-serif text-xs">A−</span>
        </ToolbarButton>

        <ToolbarButton
          title="Increase font size (Ctrl+Shift+>)"
          onActivate={() => changeFontSize(editor, 1)}
        >
          <span className="font-serif text-sm">A+</span>
        </ToolbarButton>

        
        <ToolbarDropdown
          title="Lists"
          label={
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          }
          isActive={
            toolbarState.isBulletList ||
            toolbarState.isOrderedList ||
            toolbarState.isTaskList
          }
        >
          <DropdownItem
            onActivate={() => editor.chain().focus().toggleBulletList().run()}
            isActive={toolbarState.isBulletList}
          >
            Bullet list
          </DropdownItem>

          <DropdownItem
            onActivate={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={toolbarState.isOrderedList}
          >
            Ordered list
          </DropdownItem>

          <DropdownItem
            onActivate={() => editor.chain().focus().toggleTaskList().run()}
            isActive={toolbarState.isTaskList}
          >
            Task list
          </DropdownItem>
        </ToolbarDropdown>

        <ToolbarButton
          title="Blockquote"
          isActive={toolbarState.isBlockquote}
          disabled={!toolbarState.canBlockquote}
          onActivate={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
          </svg>
        </ToolbarButton>

        <ToolbarButton
          title="Code Block"
          isActive={toolbarState.isCodeBlock}
          disabled={!toolbarState.canCodeBlock}
          onActivate={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M16 18l6-6-6-6M8 6L2 12l6 6" />
          </svg>
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          title="Bold"
          isActive={toolbarState.isBold}
          disabled={!toolbarState.canBold}
          onActivate={() => editor.chain().focus().toggleBold().run()}
        >
          <span className="font-serif font-bold">B</span>
        </ToolbarButton>

        <ToolbarButton
          title="Italic"
          isActive={toolbarState.isItalic}
          disabled={!toolbarState.canItalic}
          onActivate={() => editor.chain().focus().toggleItalic().run()}
        >
          <span className="font-serif italic">I</span>
        </ToolbarButton>

        <ToolbarButton
          title="Strikethrough"
          isActive={toolbarState.isStrike}
          disabled={!toolbarState.canStrike}
          onActivate={() => editor.chain().focus().toggleStrike().run()}
        >
          <span className="font-serif line-through">ab</span>
        </ToolbarButton>

        <ToolbarButton
          title="Code"
          isActive={toolbarState.isCode}
          disabled={!toolbarState.canCode}
          onActivate={() => editor.chain().focus().toggleCode().run()}
        >
          <span className="font-mono text-[10px]">{"</>"}</span>
        </ToolbarButton>

        <ToolbarButton
          title="Underline"
          isActive={toolbarState.isUnderline}
          onActivate={() => editor.chain().focus().toggleUnderline().run()}
        >
          <span className="font-serif underline">U</span>
        </ToolbarButton>

        <ToolbarDropdown
          title="Text color"
          label={
            <span
              className="font-serif font-bold"
              style={{ color: toolbarState.textColor || undefined }}
            >
              A
            </span>
          }
          isActive={toolbarState.hasTextColor}
          menuClassName="w-44"
        >
          {({ close }) => (
            <>
              {TEXT_COLORS.map((color) => (
                <DropdownItem
                  key={color.value}
                  onActivate={() => {
                    editor.chain().focus().setColor(color.value).run();
                    close();
                  }}
                  isActive={toolbarState.textColor === color.value}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-sm border border-gray-300"
                      style={{ backgroundColor: color.value }}
                    />
                    {color.label}
                  </span>
                </DropdownItem>
              ))}

              <DropdownItem
                onActivate={() => {
                  editor.chain().focus().unsetColor().run();
                  close();
                }}
              >
                Remove color
              </DropdownItem>

              <div className="my-1 border-t border-gray-200" />

              <RgbColorItem
                label="RGB color"
                onApply={(color) => editor.chain().focus().setColor(color).run()}
                onClose={close}
              />
            </>
          )}
        </ToolbarDropdown>

        <ToolbarDropdown
          title="Highlight color"
          label={
            <span
              className="rounded-sm px-1 font-serif"
              style={{ backgroundColor: toolbarState.highlightColor || undefined }}
            >
              H
            </span>
          }
          isActive={toolbarState.isHighlight}
          menuClassName="w-44"
        >
          {({ close }) => (
            <>
              {HIGHLIGHT_COLORS.map((color) => (
                <DropdownItem
                  key={color.value}
                  onActivate={() => {
                    editor.chain().focus().setHighlight({ color: color.value }).run();
                    close();
                  }}
                  isActive={toolbarState.highlightColor === color.value}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-sm border border-gray-300"
                      style={{ backgroundColor: color.value }}
                    />
                    {color.label}
                  </span>
                </DropdownItem>
              ))}

              <DropdownItem
                onActivate={() => {
                  editor.chain().focus().unsetHighlight().run();
                  close();
                }}
              >
                Remove highlight
              </DropdownItem>

              <div className="my-1 border-t border-gray-200" />

              <RgbColorItem
                label="RGB highlight"
                onApply={(color) =>
                  editor.chain().focus().setHighlight({ color }).run()
                }
                onClose={close}
              />
            </>
          )}
        </ToolbarDropdown>

        <LinkControl
          editor={editor}
          isActive={toolbarState.isLink}
          currentHref={toolbarState.linkHref}
        />

        <Divider />

        <ToolbarButton
          title="Superscript"
          isActive={toolbarState.isSuperscript}
          onActivate={() => editor.chain().focus().toggleSuperscript().run()}
        >
          <span>
            x<sup>2</sup>
          </span>
        </ToolbarButton>

        <ToolbarButton
          title="Subscript"
          isActive={toolbarState.isSubscript}
          onActivate={() => editor.chain().focus().toggleSubscript().run()}
        >
          <span>
            x<sub>2</sub>
          </span>
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          title="Align Left"
          isActive={toolbarState.alignLeft}
          onActivate={() => editor.chain().focus().setTextAlign("left").run()}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h10M4 18h16" />
          </svg>
        </ToolbarButton>

        <ToolbarButton
          title="Align Center"
          isActive={toolbarState.alignCenter}
          onActivate={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M7 12h10M4 18h16" />
          </svg>
        </ToolbarButton>

        <ToolbarButton
          title="Align Right"
          isActive={toolbarState.alignRight}
          onActivate={() => editor.chain().focus().setTextAlign("right").run()}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M10 12h10M4 18h16" />
          </svg>
        </ToolbarButton>

        <ToolbarButton
          title="Justify"
          isActive={toolbarState.alignJustify}
          onActivate={() => editor.chain().focus().setTextAlign("justify").run()}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </ToolbarButton>


        <ToolbarDropdown
          title="Line height"
          label={
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 6h10M4 12h10M4 18h10M18 5v14m0 0l-3-3m3 3l3-3m-3-11l-3 3m3-3l3 3"
              />
            </svg>
          }
          isActive={toolbarState.lineHeight && toolbarState.lineHeight !== 'normal'}
        >
          <DropdownItem
            onActivate={() => editor.chain().focus().unsetLineHeight().run()}
            isActive={!toolbarState.lineHeight || toolbarState.lineHeight === 'normal'}
          >
            Default
          </DropdownItem>

          <DropdownItem
            onActivate={() => editor.chain().focus().setLineHeight('1').run()}
            isActive={toolbarState.lineHeight === '1'}
          >
            1.0
          </DropdownItem>

          <DropdownItem
            onActivate={() => editor.chain().focus().setLineHeight('1.15').run()}
            isActive={toolbarState.lineHeight === '1.15'}
          >
            1.15
          </DropdownItem>

          <DropdownItem
            onActivate={() => editor.chain().focus().setLineHeight('1.5').run()}
            isActive={toolbarState.lineHeight === '1.5'}
          >
            1.5
          </DropdownItem>

          <DropdownItem
            onActivate={() => editor.chain().focus().setLineHeight('2').run()}
            isActive={toolbarState.lineHeight === '2'}
          >
            2.0
          </DropdownItem>
        </ToolbarDropdown>
        <Divider />

        <ContentBlockPicker editor={editor} />

        <TableCreationPicker
          onInsert={(rows, cols) => {
            insertTable(editor, rows, cols);
          }}
        />
      </div>

      <TableControls editor={editor} />
    </>
  );
}
