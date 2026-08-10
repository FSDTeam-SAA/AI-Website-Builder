"use client";

import Link from "next/link";
import Image from "next/image";
import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/nextjs";

import { cn } from "@/lib/utils";
import { useScroll } from "@/hooks/use-scroll";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserControl } from "@/components/user-control";

export const Navbar = () => {
  const isScrolled = useScroll();

  return (
    <nav
      className={cn(
        "fixed inset-x-0 top-0 z-50 px-3 py-3 transition-all duration-300 sm:px-5",
        isScrolled && "py-2",
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-7xl items-center justify-between rounded-2xl border px-3 py-2.5 transition-all duration-300 sm:px-4",
          isScrolled
            ? "border-zinc-200/80 bg-white/90 shadow-[0_16px_45px_-25px_rgba(15,23,42,0.35)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/85"
            : "border-transparent bg-transparent",
        )}
      >
        <Link href="/" className="group flex items-center gap-2.5" aria-label="Vibe home">
          <span className="flex size-9 items-center justify-center rounded-xl border border-zinc-200/80 bg-white p-1 shadow-sm transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105 dark:border-white/10 dark:bg-white/5">
            <Image src="/brand/vibe-mark.png" alt="" width={30} height={30} priority />
          </span>
          <span className="text-lg font-semibold tracking-[-0.03em]">Vibe</span>
          <span className="hidden rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-600 sm:inline-flex dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300">
            Beta
          </span>
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link
            href="/pricing"
            className="hidden rounded-full px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-white/70 hover:text-zinc-950 sm:inline-flex dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white"
          >
            Pricing
          </Link>
          <ThemeToggle className="rounded-full border border-zinc-200/80 bg-white/70 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10" />
          <SignedOut>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <SignUpButton>
                <Button variant="ghost" size="sm" className="hidden rounded-full px-4 sm:inline-flex">
                  Sign up
                </Button>
              </SignUpButton>
              <SignInButton>
                <Button
                  size="sm"
                  className="rounded-full bg-zinc-950 px-4 text-white shadow-sm hover:bg-indigo-600 dark:bg-white dark:text-zinc-950 dark:hover:bg-indigo-100"
                >
                  Sign in
                </Button>
              </SignInButton>
            </div>
          </SignedOut>
          <SignedIn>
            <UserControl showName />
          </SignedIn>
        </div>
      </div>
    </nav>
  );
};
