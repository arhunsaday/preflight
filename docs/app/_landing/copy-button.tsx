'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyCommand({ command }: { command: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      /* clipboard blocked: the command stays selectable */
    }
  };
  return (
    <div className="pf-cmd">
      <span className="pf-cmd-prompt" aria-hidden="true">$</span>
      <code>{command}</code>
      <button type="button" onClick={copy} aria-label={done ? 'Copied' : 'Copy command'}>
        {done ? <Check size={16} /> : <Copy size={16} />}
        <span>{done ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  );
}
