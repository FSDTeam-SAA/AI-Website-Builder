"use client";

import { CodeIcon, FileCodeIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type FrameworkValue = "NEXTJS" | "STATIC_HTML";

interface Props {
  value: FrameworkValue;
  onChange: (value: FrameworkValue) => void;
  disabled?: boolean;
  className?: string;
}

const OPTIONS: {
  id: FrameworkValue;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  {
    id: "NEXTJS",
    label: "React app",
    description: "Next.js, Tailwind, shadcn/ui — for interactive apps",
    icon: CodeIcon,
  },
  {
    id: "STATIC_HTML",
    label: "HTML site",
    description: "Plain HTML, CSS and JS — fast, simple, no build step",
    icon: FileCodeIcon,
  },
];

/** What kind of thing to build. Chosen before the project exists. */
export const FrameworkSelect = ({ value, onChange, disabled, className }: Props) => {
  const active = OPTIONS.find((o) => o.id === value) ?? OPTIONS[0];
  const ActiveIcon = active.icon;

  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(v) => onChange(v as FrameworkValue)}
    >
      <SelectTrigger
        size="sm"
        className={cn("h-7 w-auto gap-1.5 border-none text-xs shadow-none", className)}
        aria-label="Project type"
      >
        <ActiveIcon className="size-3.5 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>

      <SelectContent align="start">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <SelectItem key={option.id} value={option.id} className="text-xs">
              <span className="flex items-start gap-2">
                <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex flex-col items-start">
                  <span>{option.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};
