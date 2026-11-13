'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function CopyCommand({ command, className }: { command: string; className?: string }) {
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
    <div className={cn('pf-cmd rounded-lg border bg-card', className)}>
      <span className="pf-cmd-prompt" aria-hidden="true">$</span>
      <code>{command}</code>
      <Button variant="secondary" size="sm" onClick={copy} aria-label={done ? 'Copied' : 'Copy command'}>
        {done ? <Check /> : <Copy />}
        <span>{done ? 'Copied' : 'Copy'}</span>
      </Button>
    </div>
  );
}
