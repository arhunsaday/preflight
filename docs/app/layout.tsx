import type { Metadata, Viewport } from 'next';
import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
});

const title = 'Preflight — see and fix your AI coding setup';
const description =
  'Preflight inventories your Claude Code, Codex and Cursor setup, shows what it costs in context, and fixes it with a preview first. CLI and desktop app, local first.';

export const metadata: Metadata = {
  metadataBase: new URL('https://preflight.arhun.fr'),
  title: { default: title, template: '%s | Preflight' },
  description,
  applicationName: 'Preflight',
  openGraph: {
    type: 'website',
    siteName: 'Preflight',
    title,
    description,
    url: '/',
    // The image comes from app/opengraph-image.tsx.
  },
  twitter: { card: 'summary_large_image', title, description },
  // Favicon and touch icon come from app/icon.svg and app/apple-icon.png.
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f7fb' },
    { media: '(prefers-color-scheme: dark)', color: '#050a1a' },
  ],
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider theme={{ defaultTheme: 'dark' }}>{children}</RootProvider>
      </body>
    </html>
  );
}
