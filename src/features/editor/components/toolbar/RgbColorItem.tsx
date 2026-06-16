"use client";

import { useMemo, useState } from "react";

type RgbChannel = "r" | "g" | "b";
type RgbValue = Record<RgbChannel, string>;

interface RgbColorItemProps {
  label: string;
  onApply: (color: string) => void;
  onClose: () => void;
}

function sanitizeRgbChannel(value: string) {
  const digitsOnly = value.replace(/\D/g, "").slice(0, 3);

  if (!digitsOnly) return "";

  return String(Math.min(Number(digitsOnly), 255));
}

function toRgbCssColor(rgb: RgbValue) {
  const channels = [rgb.r, rgb.g, rgb.b];

  if (channels.some((channel) => channel === "")) {
    return null;
  }

  const values = channels.map(Number);

  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null;
  }

  return `rgb(${values[0]}, ${values[1]}, ${values[2]})`;
}

export function RgbColorItem({ label, onApply, onClose }: RgbColorItemProps) {
  const [rgb, setRgb] = useState<RgbValue>({
    r: "",
    g: "",
    b: "",
  });

  const cssColor = toRgbCssColor(rgb);

  const updateChannel = (channel: RgbChannel, value: string) => {
    setRgb((current) => ({
      ...current,
      [channel]: sanitizeRgbChannel(value),
    }));
  };

  const applyColor = () => {
    if (!cssColor) return;

    onApply(cssColor);
    onClose();
  };

  return (
    <div
      className="px-2 py-1.5"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="mb-1 text-[11px] font-medium text-gray-500">
        {label}
      </div>

      <div className="grid grid-cols-3 gap-1">
        {(["r", "g", "b"] as const).map((channel) => (
          <input
            key={channel}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
            value={rgb[channel]}
            placeholder={channel.toUpperCase()}
            aria-label={`RGB ${channel.toUpperCase()}`}
            className="h-7 min-w-0 rounded border border-gray-300 px-2 text-xs outline-none focus:border-blue-500"
            onChange={(event) => updateChannel(channel, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyColor();
              }

              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
          />
        ))}
      </div>

      <button
        type="button"
        disabled={!cssColor}
        className="mt-2 h-7 w-full rounded border border-gray-300 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        onClick={(event) => {
          event.stopPropagation();
          applyColor();
        }}
      >
        Apply
      </button>
    </div>
  );
}