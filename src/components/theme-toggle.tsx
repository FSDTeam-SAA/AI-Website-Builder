"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Props {
  className?: string;
}

/**
 * One-click light/dark switch.
 *
 * Appearance used to live in a submenu of the project dropdown, which meant
 * three clicks and only on a project page — signed-out visitors on the home page
 * could not change it at all.
 */
export const ThemeToggle = ({ className }: Props) => {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // The server cannot know the stored preference, so which icon is correct is
  // only knowable after hydration. Rendering one early flashes the wrong one.
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={cn("size-8 shrink-0 p-0", className)}
      aria-label={label}
      title={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {/* Reserve the space before mount so the row does not shift. */}
      {!mounted ? (
        <SunIcon className="size-4 opacity-0" />
      ) : isDark ? (
        <SunIcon className="size-4" />
      ) : (
        <MoonIcon className="size-4" />
      )}
    </Button>
  );
};
