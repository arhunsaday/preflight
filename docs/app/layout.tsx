import type { Metadata } from 'next';
import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://ai.arhun.fr'),
  title: { default: 'Preflight', template: '%s | Preflight' },
  description: 'Preflight, the Claude Code kit, and the workflows around them',
  icons: { icon: [{ url: '/img/favicon.svg', type: 'image/svg+xml' }, { url: '/img/favicon.png' }], apple: '/img/favicon.png' },
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
