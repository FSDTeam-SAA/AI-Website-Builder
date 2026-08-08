"use client";

import {
  CopyCheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  MaximizeIcon,
  MonitorIcon,
  MousePointerClickIcon,
  RefreshCcwIcon,
  RotateCcwIcon,
  SmartphoneIcon,
  TabletIcon,
  TerminalIcon,
  TypeIcon,
} from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { VibeMode } from "@/modules/preview/protocol";

export interface DevicePreset {
  id: string;
  label: string;
  width: number | null;
  height: number | null;
}

export const DEVICE_PRESETS: DevicePreset[] = [
  { id: "responsive", label: "Responsive", width: null, height: null },
  { id: "mobile", label: "Mobile · 390", width: 390, height: 844 },
  { id: "mobile-lg", label: "Mobile L · 430", width: 430, height: 932 },
  { id: "tablet", label: "Tablet · 768", width: 768, height: 1024 },
  { id: "laptop", label: "Laptop · 1280", width: 1280, height: 800 },
  { id: "desktop", label: "Desktop · 1600", width: 1600, height: 1000 },
];

export const ZOOM_LEVELS = [0.5, 0.75, 0.9, 1, 1.25, 1.5];

interface Props {
  mode: VibeMode;
  onModeChange: (mode: VibeMode) => void;
  device: DevicePreset;
  onDeviceChange: (device: DevicePreset) => void;
  landscape: boolean;
  onToggleOrientation: () => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  route: string;
  sandboxUrl: string | null;
  onRefresh: () => void;
  onFullscreen: () => void;
  consoleOpen: boolean;
  onToggleConsole: () => void;
  errorCount: number;
  inspectorAvailable: boolean;
  disabled?: boolean;
}

export const PreviewToolbar = ({
  mode,
  onModeChange,
  device,
  onDeviceChange,
  landscape,
  onToggleOrientation,
  zoom,
  onZoomChange,
  route,
  sandboxUrl,
  onRefresh,
  onFullscreen,
  consoleOpen,
  onToggleConsole,
  errorCount,
  inspectorAvailable,
  disabled,
}: Props) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!sandboxUrl) return;
    try {
      await navigator.clipboard.writeText(sandboxUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is unavailable outside secure contexts.
    }
  };

  const toggleMode = (next: VibeMode) => {
    onModeChange(mode === next ? "off" : next);
  };

  return (
    <div className="flex items-center gap-x-1 border-b bg-sidebar p-2">
      <div className="flex items-center rounded-md border">
        <Hint text="Select an element to edit" side="bottom" align="start">
          <Button
            size="sm"
            variant={mode === "inspect" ? "default" : "ghost"}
            className="h-7 rounded-r-none"
            disabled={disabled || !inspectorAvailable}
            onClick={() => toggleMode("inspect")}
          >
            <MousePointerClickIcon className="size-3.5" />
          </Button>
        </Hint>
        <Separator orientation="vertical" className="h-5" />
        <Hint text="Double-click any text to edit it" side="bottom">
          <Button
            size="sm"
            variant={mode === "text-edit" ? "default" : "ghost"}
            className="h-7 rounded-l-none"
            disabled={disabled || !inspectorAvailable}
            onClick={() => toggleMode("text-edit")}
          >
            <TypeIcon className="size-3.5" />
          </Button>
        </Hint>
      </div>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Select
        value={device.id}
        onValueChange={(id) => {
          const preset = DEVICE_PRESETS.find((d) => d.id === id);
          if (preset) onDeviceChange(preset);
        }}
        disabled={disabled}
      >
        <SelectTrigger size="sm" className="h-7 w-[150px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DEVICE_PRESETS.map((preset) => (
            <SelectItem key={preset.id} value={preset.id} className="text-xs">
              <span className="flex items-center gap-2">
                {preset.width === null ? (
                  <MonitorIcon className="size-3.5" />
                ) : preset.width <= 430 ? (
                  <SmartphoneIcon className="size-3.5" />
                ) : preset.width <= 768 ? (
                  <TabletIcon className="size-3.5" />
                ) : (
                  <MonitorIcon className="size-3.5" />
                )}
                {preset.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {device.width !== null && (
        <Hint text={landscape ? "Portrait" : "Landscape"} side="bottom">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            disabled={disabled}
            onClick={onToggleOrientation}
          >
            <RotateCcwIcon className="size-3.5" />
          </Button>
        </Hint>
      )}

      <Select
        value={String(zoom)}
        onValueChange={(v) => onZoomChange(Number(v))}
        disabled={disabled}
      >
        <SelectTrigger size="sm" className="h-7 w-[76px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ZOOM_LEVELS.map((level) => (
            <SelectItem key={level} value={String(level)} className="text-xs">
              {Math.round(level * 100)}%
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* Route bar — reflects in-iframe navigation, which the old preview had
          no visibility into at all. */}
      <button
        type="button"
        onClick={handleCopy}
        disabled={!sandboxUrl}
        className={cn(
          "flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md border px-2 text-left text-xs",
          "text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50",
        )}
        title={sandboxUrl ?? "No preview running"}
      >
        {copied ? (
          <CopyCheckIcon className="size-3.5 shrink-0 text-emerald-600" />
        ) : (
          <CopyIcon className="size-3.5 shrink-0" />
        )}
        <span className="truncate font-mono">{route || "/"}</span>
      </button>

      <Hint text="Reload preview" side="bottom">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          disabled={disabled}
          onClick={onRefresh}
        >
          <RefreshCcwIcon className="size-3.5" />
        </Button>
      </Hint>

      <Hint text={errorCount > 0 ? `${errorCount} console errors` : "Console"} side="bottom">
        <Button
          size="sm"
          variant={consoleOpen ? "default" : "ghost"}
          className="relative h-7 px-2"
          onClick={onToggleConsole}
        >
          <TerminalIcon className="size-3.5" />
          {errorCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-semibold text-white">
              {errorCount > 9 ? "9+" : errorCount}
            </span>
          )}
        </Button>
      </Hint>

      <Hint text="Fullscreen" side="bottom">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          disabled={disabled}
          onClick={onFullscreen}
        >
          <MaximizeIcon className="size-3.5" />
        </Button>
      </Hint>

      <Hint text="Open in a new tab" side="bottom" align="end">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          disabled={!sandboxUrl}
          onClick={() => sandboxUrl && window.open(sandboxUrl, "_blank", "noopener")}
        >
          <ExternalLinkIcon className="size-3.5" />
        </Button>
      </Hint>
    </div>
  );
};
