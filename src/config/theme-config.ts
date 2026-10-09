/**
 * Theme Configuration - ChatFlow Design System
 * Defines official color palettes, tokens, and typography for Light and Dark modes.
 * Complies with Rule 9: Automatically updated on UI/UX color changes.
 */

export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  sidebar: {
    background: string;
    foreground: string;
    primary: string;
    primaryForeground: string;
    accent: string;
    accentForeground: string;
    border: string;
    ring: string;
  };
}

export interface ThemeConfig {
  name: string;
  label: string;
  radius: string;
  colors: {
    light: ThemeColors;
    dark: ThemeColors;
  };
}

export const themeConfig: ThemeConfig = {
  name: "chatflow-modern",
  label: "ChatFlow Modern Indigo & Slate",
  radius: "0.75rem",
  colors: {
    light: {
      background: "hsl(210, 20%, 98%)",       // #f8fafc - soft slate-50 canvas
      foreground: "hsl(222.2, 84%, 4.9%)",     // #020817 - deep slate text
      card: "hsl(0, 0%, 100%)",                // #ffffff - elevated surfaces
      cardForeground: "hsl(222.2, 84%, 4.9%)",
      popover: "hsl(0, 0%, 100%)",
      popoverForeground: "hsl(222.2, 84%, 4.9%)",
      primary: "hsl(221.2, 83.2%, 53.3%)",     // #2563eb - vibrant royal blue
      primaryForeground: "hsl(210, 40%, 98%)", // #f8fafc - white text on primary
      secondary: "hsl(210, 40%, 96.1%)",       // #f1f5f9 - light slate
      secondaryForeground: "hsl(222.2, 47.4%, 11.2%)",
      muted: "hsl(210, 40%, 96.1%)",
      mutedForeground: "hsl(215.4, 16.3%, 46.9%)", // #64748b - muted label
      accent: "hsl(214, 95%, 93%)",            // #eff6ff - subtle blue tint
      accentForeground: "hsl(221.2, 83.2%, 53.3%)",
      destructive: "hsl(0, 84.2%, 60.2%)",
      destructiveForeground: "hsl(210, 40%, 98%)",
      border: "hsl(214.3, 31.8%, 91.4%)",      // #e2e8f0 - refined subtle border
      input: "hsl(214.3, 31.8%, 91.4%)",
      ring: "hsl(221.2, 83.2%, 53.3%)",
      sidebar: {
        background: "hsl(210, 33%, 99%)",      // #fcfdfe - clean sidebar rail
        foreground: "hsl(215.4, 16.3%, 46.9%)",
        primary: "hsl(221.2, 83.2%, 53.3%)",
        primaryForeground: "hsl(0, 0%, 100%)",
        accent: "hsl(217, 91%, 95%)",          // #eff6ff - selected chat accent
        accentForeground: "hsl(221.2, 83.2%, 53.3%)",
        border: "hsl(214.3, 31.8%, 91.4%)",
        ring: "hsl(221.2, 83.2%, 53.3%)",
      },
    },
    dark: {
      background: "hsl(224, 71%, 4%)",          // #020617 - obsidian slate
      foreground: "hsl(210, 40%, 98%)",        // #f8fafc
      card: "hsl(222.2, 84%, 4.9%)",           // #0f172a - dark card surface
      cardForeground: "hsl(210, 40%, 98%)",
      popover: "hsl(222.2, 84%, 4.9%)",
      popoverForeground: "hsl(210, 40%, 98%)",
      primary: "hsl(217.2, 91.2%, 59.8%)",     // #3b82f6 - luminous blue
      primaryForeground: "hsl(0, 0%, 100%)",
      secondary: "hsl(217.2, 32.6%, 17.5%)",   // #1e293b
      secondaryForeground: "hsl(210, 40%, 98%)",
      muted: "hsl(217.2, 32.6%, 17.5%)",
      mutedForeground: "hsl(215, 20.2%, 65.1%)", // #94a3b8
      accent: "hsl(217.2, 32.6%, 17.5%)",
      accentForeground: "hsl(210, 40%, 98%)",
      destructive: "hsl(0, 62.8%, 30.6%)",
      destructiveForeground: "hsl(210, 40%, 98%)",
      border: "hsl(217.2, 32.6%, 17.5%)",
      input: "hsl(217.2, 32.6%, 17.5%)",
      ring: "hsl(224.3, 76.3%, 48%)",
      sidebar: {
        background: "hsl(222.2, 84%, 4.9%)",
        foreground: "hsl(215, 20.2%, 65.1%)",
        primary: "hsl(217.2, 91.2%, 59.8%)",
        primaryForeground: "hsl(0, 0%, 100%)",
        accent: "hsl(217.2, 32.6%, 17.5%)",
        accentForeground: "hsl(210, 40%, 98%)",
        border: "hsl(217.2, 32.6%, 17.5%)",
        ring: "hsl(217.2, 91.2%, 59.8%)",
      },
    },
  },
};
