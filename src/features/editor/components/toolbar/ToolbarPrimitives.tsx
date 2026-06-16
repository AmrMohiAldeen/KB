"use client";

import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingList,
  FloatingPortal,
  offset,
  shift,
  safePolygon,
  useClick,
  useDismiss,
  useFloating,
  useHover,
  useInteractions,
  useListItem,
  useListNavigation,
  useMergeRefs,
  useRole,
} from "@floating-ui/react";
import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
} from "react";

export const ICON_SIZE = "h-4 w-4";

// Combines conditional CSS class names into one className string,
// ignoring false, null, and undefined values.
// cn short for className 
const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

type DropdownContextValue = {
  activeIndex: number | null;
  close: () => void;
  getItemProps: ReturnType<typeof useInteractions>["getItemProps"]; // applying Floating UI item props without losing keyboard/ARIA behavior
};

const DropdownContext = createContext<DropdownContextValue | null>(null);

type ToolbarButtonProps = {
  title: string;
  onActivate: () => void;
  isActive?: boolean;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
  className?: string;
  ariaHasPopup?: React.AriaAttributes["aria-haspopup"];
  ariaExpanded?: boolean;
};

export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  function ToolbarButton(
    {
      title,
      onActivate,
      isActive,
      disabled = false,
      danger = false,
      children,
      className,
      ariaHasPopup,
      ariaExpanded,
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        title={title}
        aria-label={title}
        aria-pressed={isActive}
        aria-haspopup={ariaHasPopup}
        aria-expanded={ariaExpanded}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          onActivate();
        }}
        className={cn(
          "flex h-8 min-w-8 items-center justify-center gap-1 rounded px-2 py-1.5",
          "whitespace-nowrap text-sm font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
          danger
            ? "text-red-600 hover:bg-red-50 hover:text-red-700"
            : Boolean(isActive)
              ? "bg-gray-200 text-gray-900"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        {children}
      </button>
    );
  },
);

export function ToolbarDropdown({
  title,
  label,
  isActive = false,
  danger = false,
  children,
  align = "left",
  menuClassName = "w-40",
}: {
  title: string;
  label: React.ReactNode;
  isActive?: boolean;
  danger?: boolean;
  children: | React.ReactNode | ((args: { close: () => void }) => React.ReactNode);
  align?: "left" | "right";
  menuClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const listRef = useRef<Array<HTMLElement | null>>([]);
  const menuId = useId();
  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: align === "right" ? "bottom-end" : "bottom-start",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip(), shift({ padding: 8 })],
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "menu" });
  const listNavigation = useListNavigation(context, {
    activeIndex,
    listRef,
    loop: true,
    focusItemOnOpen: true,
    onNavigate: setActiveIndex,
  });
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    click,
    dismiss,
    role,
    listNavigation,
  ]);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        {...getReferenceProps({
          onMouseDown: (event) => event.preventDefault(),
        })}
        className={cn(
          "flex h-8 items-center justify-center gap-1 rounded px-2 py-1.5",
          "text-sm font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
          danger
            ? "text-red-600 hover:bg-red-50 hover:text-red-700"
            : isActive
              ? "bg-gray-200 text-gray-900"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
        )}
      >
        {label}
        <svg
          className="h-3 w-3 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <FloatingPortal>
          <FloatingFocusManager context={context} initialFocus={-1} modal={false}>
            <FloatingList elementsRef={listRef}>
              <DropdownContext.Provider value={{ activeIndex, close, getItemProps }}>
                <div
                  // Floating UI provides callback refs rather than mutable React refs.
                  // eslint-disable-next-line react-hooks/refs
                  ref={refs.setFloating}
                  id={menuId}
                  {...getFloatingProps()}
                  className={cn(
                    "z-50 rounded-md bg-white p-1 shadow-lg ring-1 ring-black/10",
                    menuClassName,
                  )}
                  style={floatingStyles}
                >
                  {typeof children === "function"
                  ? children({ close: () => setIsOpen(false) })
                  : children}
                </div>
              </DropdownContext.Provider>
            </FloatingList>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}

export function DropdownItem({
  onActivate,
  isActive = false,
  danger = false,
  disabled = false,
  children,
}: {
  onActivate: () => void;
  isActive?: boolean;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const context = useContext(DropdownContext);
  const { ref, index } = useListItem();
  const itemProps = context?.getItemProps({
    onMouseDown: (event) => event.preventDefault(),
    onClick: (event) => {
      event.preventDefault();
      if (disabled) return;
      onActivate();
      context.close();
    },
  });

  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      disabled={disabled}
      tabIndex={!context || context.activeIndex === index ? 0 : -1}
      {...itemProps}
      className={cn(
        "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        danger
          ? "text-red-600 hover:bg-red-50"
          : isActive
            ? "bg-gray-100 font-semibold text-gray-900"
            : "text-gray-700 hover:bg-gray-50",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {children}
    </button>
  );
}

export function DropdownSubmenu({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  const parent = useContext(DropdownContext);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const listRef = useRef<Array<HTMLElement | null>>([]);
  const { ref: listItemRef, index } = useListItem();
  const { refs, floatingStyles, context, placement } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: "right-start",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [offset({ mainAxis: 4, alignmentAxis: -4 }), flip(), shift({ padding: 8 })],
  });
  // Floating UI provides callback refs rather than mutable React refs.
  // eslint-disable-next-line react-hooks/refs
  const mergedReferenceRef = useMergeRefs([listItemRef, refs.setReference]);
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    useHover(context, { handleClose: safePolygon() }),
    useClick(context),
    useDismiss(context),
    useRole(context, { role: "menu" }),
    useListNavigation(context, {
      activeIndex,
      listRef,
      loop: true,
      focusItemOnOpen: true,
      onNavigate: setActiveIndex,
    }),
  ]);
  const close = useCallback(() => {
    setIsOpen(false);
    parent?.close();
  }, [parent]);
  const triggerProps = parent?.getItemProps(
    getReferenceProps({
      onMouseDown: (event) => event.preventDefault(),
    }),
  );

  return (
    <>
      <button
        ref={mergedReferenceRef}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        tabIndex={!parent || parent.activeIndex === index ? 0 : -1}
        {...triggerProps}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm text-gray-700",
          "transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        )}
      >
        {label}
        <svg
          className="h-3 w-3 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d={placement.startsWith("left") ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"}
          />
        </svg>
      </button>

      {isOpen && (
        <FloatingPortal>
          <FloatingFocusManager context={context} initialFocus={-1} modal={false}>
            <FloatingList elementsRef={listRef}>
              <DropdownContext.Provider value={{ activeIndex, close, getItemProps }}>
                <div
                  // Floating UI provides callback refs rather than mutable React refs.
                  // eslint-disable-next-line react-hooks/refs
                  ref={refs.setFloating}
                  {...getFloatingProps()}
                  className="z-60 w-56 rounded-md bg-white p-1 shadow-lg ring-1 ring-black/10"
                  style={floatingStyles}
                >
                  {children}
                </div>
              </DropdownContext.Provider>
            </FloatingList>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}

export function Divider({ className }: { className?: string }) {
  return (
    <div
      className={cn("mx-1 h-5 w-px bg-gray-200", className)}
      aria-hidden="true"
    />
  );
}

export function DropdownCheckboxItem({
  checked,
  onCheckedChange,
  children,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  const context = useContext(DropdownContext);
  const { ref, index } = useListItem();
  const itemProps = context?.getItemProps({
    onMouseDown: (event) => event.preventDefault(),
    onClick: (event) => {
      event.preventDefault();
      onCheckedChange(!checked);
    },
  });

  return (
    <button
      ref={ref}
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      tabIndex={!context || context.activeIndex === index ? 0 : -1}
      {...itemProps}
      className={cn(
        "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        checked
          ? "bg-gray-100 font-semibold text-gray-900"
          : "text-gray-700 hover:bg-gray-50",
      )}
    >
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded border border-gray-300">
        {checked && (
          <svg
            className="h-2.5 w-2.5"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path d="M2 6.5 4.5 9 10 3" strokeWidth="1.5" />
          </svg>
        )}
      </span>
      {children}
    </button>
  );
}
