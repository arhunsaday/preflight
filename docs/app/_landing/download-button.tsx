'use client';

import { useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';

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
    <a className="pf-btn pf-btn-primary" href={RELEASES}>
      <Download size={16} />
      Download for {os}
    </a>
  );
}
