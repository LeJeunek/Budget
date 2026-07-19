"use client"

/**
 * ThemeToggle — light/dark/system theme switcher built on `next-themes`.
 * Requires `ThemeProvider` (see `./theme-provider.tsx`) to be mounted
 * somewhere above it in the tree (the root layout does this).
 *
 * Usage:
 * ```tsx
 * <ThemeToggle />
 * <ThemeToggle className="ml-2" />
 * ```
 */

import * as React from "react"
import { useTheme } from "next-themes"
import { CheckIcon, LaptopIcon, MoonIcon, SunIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: LaptopIcon },
] as const

export interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme()
  // next-themes cannot know the resolved theme until after hydration; render
  // a static, non-interactive placeholder until then to avoid a mismatch.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={className}
        disabled
        aria-label="Toggle theme"
      >
        <SunIcon className="size-4" aria-hidden="true" />
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative", className)}
          aria-label="Toggle theme"
        >
          <SunIcon
            className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"
            aria-hidden="true"
          />
          <MoonIcon
            className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
            aria-hidden="true"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
            <Icon aria-hidden="true" />
            {label}
            {theme === value && (
              <CheckIcon className="ml-auto size-3.5" aria-hidden="true" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
