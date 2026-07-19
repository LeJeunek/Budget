"use client"

/**
 * ThemeProvider — thin wrapper around `next-themes` so the rest of the app
 * never imports `next-themes` directly (keeps the dependency swappable).
 *
 * Ownership note: this component is built by the UI Component Engineer, but
 * *mounting* it belongs to the Frontend Lead in `src/app/layout.tsx` (the
 * root layout owns global providers). This file only exports the wrapper.
 *
 * Usage (in `src/app/layout.tsx`, added by the Frontend Lead):
 * ```tsx
 * import { ThemeProvider } from "@/components/shared/theme-provider"
 *
 * export default function RootLayout({ children }: { children: React.ReactNode }) {
 *   return (
 *     <html lang="en" suppressHydrationWarning>
 *       <body>
 *         <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
 *           {children}
 *         </ThemeProvider>
 *       </body>
 *     </html>
 *   )
 * }
 * ```
 * `suppressHydrationWarning` on `<html>` is required by `next-themes` since
 * it sets the `class`/`style` attribute before React hydrates.
 */

import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from "next-themes"

export type { ThemeProviderProps }

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
