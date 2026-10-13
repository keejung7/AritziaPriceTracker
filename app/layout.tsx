import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/charts/styles.css";
import "./globals.css";
import { theme } from './theme';
import { editorialCssVariables } from './designTokens';

export const metadata: Metadata = {
  title: "Aritzia Price Tracker",
  description: "Track Aritzia product price history",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-mantine-color-scheme="light" style={editorialCssVariables as CSSProperties} suppressHydrationWarning>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="light">{children}</MantineProvider>
      </body>
    </html>
  );
}
