"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { ContentBlockPicker } from "../../contentBlocks/toolbar";
import {
  CALLOUT_VARIANTS,
  getCalloutVariantLabel,
  normalizeCalloutVariant,
} from "../../contentBlocks/callout/model";
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
  BULLET_LIST_STYLES,
  getListStyleLabel,
  ORDERED_LIST_STYLES,
  type BulletListStyle,
  type ListTypeName,
  type OrderedListStyle,
} from "../../extensions/ListStyles";
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
  getFontSizeLabel,
  getTextBlockLabel,
} from "./toolbarOptions";
import { getToolbarSelectionFormatting } from "./selectionFormatting";
import { LINE_HEIGHTS, DEFAULT_LINE_HEIGHT } from './toolbarOptions';
import { MathFormulaControl } from "./MathFormulaControl";
import { YoutubeControl } from "./YoutubeControl";
import {ImageControl} from "./ImageControl";
import { List, ListOrdered, ListChecks } from 'lucide-react';
import { TableOfContentsControl } from "./TableOfContentsControl";

export interface EditorToolbarProps {
  editor: Editor;
}

function isToolbarEditorReady(editor: Editor | null | undefined): editor is Editor {
  return Boolean(
    editor &&
      !editor.isDestroyed &&
      editor.view &&
      editor.extensionManager,
  );
}

function getEditorCan(editor: Editor): ReturnType<Editor["can"]> | null {
  try {
    return editor.can();
  } catch {
    return null;
  }
}

type ToolbarState = {
  isEditable: boolean;

  hasTableOfContents: boolean;
  wordCount: number;

  hasMathematics: boolean;

  canUndo: boolean;
  canRedo: boolean;
  canBlockquote: boolean;
  canCodeBlock: boolean;
  canBold: boolean;
  canItalic: boolean;
  canStrike: boolean;
  canCode: boolean;

  isTextBlockMixed: boolean;
  isHeading: boolean;
  isParagraph: boolean;
  isHeading1: boolean;
  isHeading2: boolean;
  isHeading3: boolean;
  isHeading4: boolean;

  isBulletList: boolean;
  isOrderedList: boolean;
  isTaskList: boolean;
  canRemoveList: boolean;
  bulletListStyle: BulletListStyle;
  orderedListStyle: OrderedListStyle;

  isBlockquote: boolean;
  isCodeBlock: boolean;

  isCallout: boolean;
  calloutVariant: ReturnType<typeof normalizeCalloutVariant>;

  isBold: boolean;
  isItalic: boolean;
  isStrike: boolean;
  isCode: boolean;
  isUnderline: boolean;

  textColor: string | null;
  hasTextColor: boolean;

  isHighlight: boolean;
  highlightColor: string | null;

  isLink: boolean;
  linkHref: string;

  isSuperscript: boolean;
  isSubscript: boolean;

  alignLeft: boolean;
  alignCenter: boolean;
  alignRight: boolean;
  alignJustify: boolean;

  lineHeight: string | null;
  fontFamily: string | null;
  fontSize: string | null;
};

const EMPTY_TOOLBAR_STATE: ToolbarState = {
  isEditable: false,

  hasTableOfContents: false,
  wordCount: 0,
  hasMathematics: false,

  canUndo: false,
  canRedo: false,
  canBlockquote: false,
  canCodeBlock: false,
  canBold: false,
  canItalic: false,
  canStrike: false,
  canCode: false,

  isTextBlockMixed: false,
  isHeading: false,
  isParagraph: false,
  isHeading1: false,
  isHeading2: false,
  isHeading3: false,
  isHeading4: false,

  isBulletList: false,
  isOrderedList: false,
  isTaskList: false,
  canRemoveList: false,
  bulletListStyle: "disc",
  orderedListStyle: "decimal",

  isBlockquote: false,
  isCodeBlock: false,

  isCallout: false,
  calloutVariant: normalizeCalloutVariant(null),

  isBold: false,
  isItalic: false,
  isStrike: false,
  isCode: false,
  isUnderline: false,

  textColor: null,
  hasTextColor: false,

  isHighlight: false,
  highlightColor: null,

  isLink: false,
  linkHref: "",

  isSuperscript: false,
  isSubscript: false,

  alignLeft: false,
  alignCenter: false,
  alignRight: false,
  alignJustify: false,

  lineHeight: null,
  fontFamily: null,
  fontSize: null,
};

export default function EditorToolbar({ editor }: EditorToolbarProps) {
  
  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!isToolbarEditorReady(currentEditor)) {
        return EMPTY_TOOLBAR_STATE;
      }

      const can = getEditorCan(currentEditor);

      // During editor teardown or Fast Refresh, Tiptap may expose an editor instance
      // before its command manager is ready. In that case, fall back to a disabled
      // toolbar state instead of calling command checks like can.undo().
      if (!can) {
        return EMPTY_TOOLBAR_STATE;
      }
      const selectionFormatting = getToolbarSelectionFormatting(currentEditor);
      const selectedTextBlock = selectionFormatting.textBlock;
      const selectedHeadingLevel = selectedTextBlock?.startsWith("heading:")
        ? Number(selectedTextBlock.replace("heading:", ""))
        : null;
      
      return {
        isEditable: currentEditor.isEditable,

        hasTableOfContents: Boolean(
          currentEditor.extensionManager?.extensions?.some(
            (extension) => extension.name === "tableOfContentsBlock",
          ),
        ),
        wordCount: currentEditor.storage.characterCount?.words?.() ?? 0,

        hasMathematics: Boolean(
          currentEditor.extensionManager?.extensions?.some(
            (extension) =>
              extension.name === "Mathematics" || extension.name === "mathematics",
          ),
        ),
        canUndo: can.undo(),
        canRedo: can.redo(),
        canBlockquote: can.toggleBlockquote(),
        canCodeBlock: can.toggleCodeBlock(),
        canBold: can.toggleBold(),
        canItalic: can.toggleItalic(),
        canStrike: can.toggleStrike(),
        canCode: can.toggleCode(),

        isTextBlockMixed: selectedTextBlock === null,
        isHeading: selectedHeadingLevel !== null,
        isParagraph: selectedTextBlock === "paragraph",
        isHeading1: selectedHeadingLevel === 1,
        isHeading2: selectedHeadingLevel === 2,
        isHeading3: selectedHeadingLevel === 3,

        isBulletList: currentEditor.isActive("bulletList"),
        isOrderedList: currentEditor.isActive("orderedList"),
        isTaskList: currentEditor.isActive("taskList"),
        canRemoveList:
          can.liftListItem("listItem") ||
          can.liftListItem("taskItem"),
        bulletListStyle: String(
          currentEditor.getAttributes("bulletList").listStyle ?? "disc",
        ) as BulletListStyle,
        orderedListStyle: String(
          currentEditor.getAttributes("orderedList").listStyle ?? "decimal",
        ) as OrderedListStyle,
        isBlockquote: currentEditor.isActive("blockquote"),
        isCodeBlock: currentEditor.isActive("codeBlock"),
        isCallout: currentEditor.isActive("callout"),
        calloutVariant: normalizeCalloutVariant(
          currentEditor.getAttributes("callout").variant,
        ),

        isBold: currentEditor.isActive("bold"),
        isItalic: currentEditor.isActive("italic"),
        isStrike: currentEditor.isActive("strike"),
        isCode: currentEditor.isActive("code"),
        isUnderline: currentEditor.isActive("underline"),

        textColor: selectionFormatting.textColor,
        hasTextColor: Boolean(selectionFormatting.textColor),

        isHighlight: Boolean(selectionFormatting.highlightColor),
        highlightColor: selectionFormatting.highlightColor,

        isLink: currentEditor.isActive("link"),
        linkHref: String(currentEditor.getAttributes("link").href ?? ""),

        isSuperscript: currentEditor.isActive("superscript"),
        isSubscript: currentEditor.isActive("subscript"),

        alignLeft: currentEditor.isActive({ textAlign: "left" }),
        alignCenter: currentEditor.isActive({ textAlign: "center" }),
        alignRight: currentEditor.isActive({ textAlign: "right" }),
        alignJustify: currentEditor.isActive({ textAlign: "justify" }),
        lineHeight: selectionFormatting.lineHeight,

        fontFamily: selectionFormatting.fontFamily,
        fontSize: selectionFormatting.fontSize,
      };
    },
  });

  if (!toolbarState.isEditable) return null;

  const fontFamilyLabel = getFontFamilyLabel(toolbarState.fontFamily);
  const textBlockLabel = getTextBlockLabel(toolbarState);
  const fontSizeLabel = getFontSizeLabel(toolbarState);
  const applyListStyle = (
    type: ListTypeName,
    style: BulletListStyle | OrderedListStyle,
  ) => {
    const chain = editor.chain().focus();

    if (editor.isActive(type)) {
      chain.setListStyle(type, style).run();
      return;
    }

    if (type === "bulletList") {
      chain.toggleBulletList().setListStyle(type, style).run();
      return;
    }

    chain.toggleOrderedList().setListStyle(type, style).run();
  };

  const applyDefaultBulletList = () => {
    applyListStyle("bulletList", "disc");
  };

  const applyDefaultOrderedList = () => {
    applyListStyle("orderedList", "decimal");
  };

  const removeList = () => {
    const chain = editor.chain().focus();

    if (editor.isActive("taskList")) {
      chain.liftListItem("taskItem").run();
      return;
    }

    if (editor.isActive("bulletList") || editor.isActive("orderedList")) {
      chain.liftListItem("listItem").run();
    }
  };

  return (
    <>
      <div
        role="toolbar"
        aria-label="Editor formatting"
        className="flex flex-wrap items-center gap-0.5 rounded-t-lg border-b border-gray-200 bg-white p-1.5 shadow-sm"
      >
        <ToolbarButton
          title="Undo (Ctrl+Z)"
          disabled={!toolbarState.canUndo}
          onActivate={() => editor.chain().focus().undo().run()}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </ToolbarButton>

        <ToolbarButton
          title="Redo (Ctrl+Y or Ctrl+Shift+Z)"
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
                  editor
                    .chain()
                    .focus()
                    .setEmptyCellDefaultMark("textStyle", {
                      fontFamily: font.value,
                    })
                    .setFontFamily(font.value)
                    .run();
                } else {
                  editor
                    .chain()
                    .focus()
                    .setEmptyCellDefaultMark("textStyle", {
                      fontFamily: null,
                    })
                    .unsetFontFamily()
                    .run();
                }
              }}
              isActive={
                font.value
                  ? toolbarState.fontFamily === font.value
                  : toolbarState.fontFamily === ""
              }
            >
              {font.label}
            </DropdownItem>
          ))}
        </ToolbarDropdown>

        <ToolbarDropdown
          title="Text style"
          label={<span className="w-16 truncate text-left">{textBlockLabel}</span>}
          isActive={toolbarState.isHeading}
          menuClassName="w-32"
        >
          <DropdownItem
            onActivate={() =>
              editor
                .chain()
                .focus()
                .setParagraph()
                .run()
            }
            isActive={toolbarState.isParagraph}
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
                    .setHeading({ level: heading.level })
                    .run()
                }
                isActive={isActive}
              >
                {heading.label}
              </DropdownItem>
            );
          })}
        </ToolbarDropdown>

        <ToolbarDropdown
          title="Font size"
          label={<span className="w-10 truncate text-left">{fontSizeLabel}</span>}
          isActive={Boolean(toolbarState.fontSize)}
          menuClassName="w-24"
        >
          {FONT_SIZES.map((size) => {
            const sizeNumber = Number(size.label);
            const isDefaultSize = sizeNumber === DEFAULT_FONT_SIZE;

            return (
              <DropdownItem
                key={size.value}
                onActivate={() => applyFontSize(editor, sizeNumber)}
                isActive={
                  toolbarState.fontSize === size.value ||
                  (toolbarState.fontSize === "" && isDefaultSize)
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

        
        <div className="flex items-center">
          <ToolbarButton
            title="Unordered list"
            onActivate={() => applyDefaultBulletList()}
            isActive={toolbarState.isBulletList}
          >
            <List size={18} />
          </ToolbarButton>

          <ToolbarDropdown
            title="Unordered list styles"
            label=""
            isActive={toolbarState.isBulletList}
          >
            {toolbarState.canRemoveList && toolbarState.isBulletList && (
              <>
                <DropdownItem onActivate={removeList}>Remove list</DropdownItem>
                <div className="my-1 border-t border-gray-200" />
              </>
            )}
            {BULLET_LIST_STYLES.map((style) => (
              <DropdownItem
                key={style}
                onActivate={() => applyListStyle("bulletList", style)}
                isActive={
                  toolbarState.isBulletList &&
                  toolbarState.bulletListStyle === style
                }
              >
                {getListStyleLabel(style)}
              </DropdownItem>
            ))}
          </ToolbarDropdown>
        </div>

        <div className="flex items-center">
          <ToolbarButton
            title="Ordered list"
            onActivate={() => applyDefaultOrderedList()}
            isActive={toolbarState.isOrderedList}
          >
            <ListOrdered size={18} />
          </ToolbarButton>

          
          <ToolbarDropdown
            title="Ordered list styles"
            label=""
            isActive={toolbarState.isOrderedList}
          >
            {toolbarState.canRemoveList && toolbarState.isOrderedList && (
              <>
                <DropdownItem onActivate={removeList}>Remove list</DropdownItem>
                <div className="my-1 border-t border-gray-200" />
              </>
            )}
            {ORDERED_LIST_STYLES.map((style) => (
              <DropdownItem
                key={style}
                onActivate={() => applyListStyle("orderedList", style)}
                isActive={
                  toolbarState.isOrderedList &&
                  toolbarState.orderedListStyle === style
                }
              >
                {getListStyleLabel(style)}
              </DropdownItem>
            ))}
          </ToolbarDropdown>
        </div>

        <ToolbarButton
          title="Task list"
          onActivate={() => editor.chain().focus().toggleTaskList().run()}
          isActive={toolbarState.isTaskList}
        >
          <ListChecks size={18} />
        </ToolbarButton>

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
          title="Code block (Ctrl+Alt+C)"
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
          title="Clear formatting"
          onActivate={() =>
            editor
              .chain()
              .focus()
              .clearEmptyCellDefaultMarks()
              .unsetAllMarks()
              .clearNodes()
              .run()
          }
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m4 20 6-6m0 0 7.5-7.5a2.12 2.12 0 0 1 3 3L13 17m-3-3 3 3m-3-3-4-4m7 7H9" />
          </svg>
        </ToolbarButton>

        <ToolbarButton
          title="Bold (Ctrl+B)"
          isActive={toolbarState.isBold}
          disabled={!toolbarState.canBold}
          onActivate={() =>
            editor
              .chain()
              .focus()
              .setEmptyCellDefaultMark("bold", toolbarState.isBold ? null : {})
              .toggleBold()
              .run()
          }
        >
          <span className="font-serif font-bold">B</span>
        </ToolbarButton>

        <ToolbarButton
          title="Italic (Ctrl+I)"
          isActive={toolbarState.isItalic}
          disabled={!toolbarState.canItalic}
          onActivate={() =>
            editor
              .chain()
              .focus()
              .setEmptyCellDefaultMark("italic", toolbarState.isItalic ? null : {})
              .toggleItalic()
              .run()
          }
        >
          <span className="font-serif italic">I</span>
        </ToolbarButton>

        <ToolbarButton
          title="Strikethrough (Ctrl+Shift+S)"
          isActive={toolbarState.isStrike}
          disabled={!toolbarState.canStrike}
          onActivate={() =>
            editor
              .chain()
              .focus()
              .setEmptyCellDefaultMark("strike", toolbarState.isStrike ? null : {})
              .toggleStrike()
              .run()
          }
        >
          <span className="font-serif line-through">ab</span>
        </ToolbarButton>

        <ToolbarButton
          title="Inline code (Ctrl+E)"
          isActive={toolbarState.isCode}
          disabled={!toolbarState.canCode}
          onActivate={() =>
            editor
              .chain()
              .focus()
              .setEmptyCellDefaultMark("code", toolbarState.isCode ? null : {})
              .toggleCode()
              .run()
          }
        >
          <span className="font-mono text-[10px]">{"</>"}</span>
        </ToolbarButton>

        <ToolbarButton
          title="Underline (Ctrl+U)"
          isActive={toolbarState.isUnderline}
          onActivate={() =>
            editor
              .chain()
              .focus()
              .setEmptyCellDefaultMark(
                "underline",
                toolbarState.isUnderline ? null : {},
              )
              .toggleUnderline()
              .run()
          }
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
                    editor
                      .chain()
                      .focus()
                      .setEmptyCellDefaultMark("textStyle", { color: color.value })
                      .setColor(color.value)
                      .run();
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
                  editor
                    .chain()
                    .focus()
                    .setEmptyCellDefaultMark("textStyle", { color: null })
                    .unsetColor()
                    .run();
                  close();
                }}
              >
                Remove color
              </DropdownItem>

              <div className="my-1 border-t border-gray-200" />

              <RgbColorItem
                label="RGB color"
                onApply={(color) =>
                  editor
                    .chain()
                    .focus()
                    .setEmptyCellDefaultMark("textStyle", { color })
                    .setColor(color)
                    .run()
                }
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
                    editor
                      .chain()
                      .focus()
                      .setEmptyCellDefaultMark("highlight", { color: color.value })
                      .setHighlight({ color: color.value })
                      .run();
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
                  editor
                    .chain()
                    .focus()
                    .setEmptyCellDefaultMark("highlight", null)
                    .unsetHighlight()
                    .run();
                  close();
                }}
              >
                Remove highlight
              </DropdownItem>

              <div className="my-1 border-t border-gray-200" />

              <RgbColorItem
                label="RGB highlight"
                onApply={(color) =>
                  editor
                    .chain()
                    .focus()
                    .setEmptyCellDefaultMark("highlight", { color })
                    .setHighlight({ color })
                    .run()
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
          onActivate={() =>
            editor
              .chain()
              .focus()
              .setEmptyCellDefaultMark(
                "superscript",
                toolbarState.isSuperscript ? null : {},
              )
              .toggleSuperscript()
              .run()
          }
        >
          <span>
            x<sup>2</sup>
          </span>
        </ToolbarButton>

        <ToolbarButton
          title="Subscript"
          isActive={toolbarState.isSubscript}
          onActivate={() =>
            editor
              .chain()
              .focus()
              .setEmptyCellDefaultMark(
                "subscript",
                toolbarState.isSubscript ? null : {},
              )
              .toggleSubscript()
              .run()
          }
        >
          <span>
            x<sub>2</sub>
          </span>
        </ToolbarButton>

        {toolbarState.hasMathematics && (
          <MathFormulaControl editor={editor} />
        )}

        
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
          isActive={Boolean(
            toolbarState.lineHeight &&
              toolbarState.lineHeight !== DEFAULT_LINE_HEIGHT
          )}
        >
          {LINE_HEIGHTS.map((option) => (
            <DropdownItem
              key={option.value}
              isActive={toolbarState.lineHeight === option.value}
              onActivate={() => {
                const chain = editor.chain().focus()
                                    .setEmptyCellDefaultMark("textStyle", { lineHeight: option.value })
                                    .setLineHeight(option.value)
                                    .run();
              }}
            >
              {option.label}
            </DropdownItem>
          ))}
        </ToolbarDropdown>
        <Divider />

        {toolbarState.isCallout && (
          <ToolbarDropdown
            title="Callout variant"
            label={
              <span>
                {getCalloutVariantLabel(toolbarState.calloutVariant)}
              </span>
            }
            isActive
            menuClassName="w-44"
          >
            {CALLOUT_VARIANTS.map((variant) => (
              <DropdownItem
                key={variant}
                onActivate={() =>
                  editor.chain().focus().setCalloutVariant(variant).run()
                }
                isActive={toolbarState.calloutVariant === variant}
              >
                {getCalloutVariantLabel(variant)}
              </DropdownItem>
            ))}
          </ToolbarDropdown>
        )}

        {toolbarState.hasTableOfContents && (
          <TableOfContentsControl editor={editor} />
        )}

        <ContentBlockPicker editor={editor} />

        <TableCreationPicker
          onInsert={(rows, cols) => {
            insertTable(editor, rows, cols);
          }}
        />

        <YoutubeControl editor={editor} />

        <ImageControl editor={editor}/> 
        <div className="ml-auto text-xs text-muted-foreground">
          {toolbarState.wordCount} words
        </div>
      </div>

      <TableControls editor={editor} />
    </>
  );
}
