'use client';

import { useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const RELEASES = 'https://github.com/arhunsaday/preflight/releases/latest';

const noop = () => () => {};
const detect = () => {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return 'Linux';
  return 'macOS';
};

export function DownloadButton() {
  const os = useSyncExternalStore(noop, detect, () => 'macOS');
  return (
    <Button asChild size="lg">
      <a href={RELEASES}>
        <Download />
        Download for {os}
      </a>
    </Button>
  );
}
