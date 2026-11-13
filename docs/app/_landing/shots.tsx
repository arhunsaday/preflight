'use client';

import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SHOTS = [
  {
    id: 'overview',
    label: 'Overview',
    alt: 'Preflight desktop overview: skills, MCP servers, detected resources and estimated context',
    text: 'One screen for the project: what is installed, what it adds to context, and what to do next.',
  },
  {
    id: 'doctor',
    label: 'Doctor',
    alt: 'Preflight Doctor listing findings grouped by severity',
    text: 'Findings with a severity, the context they cost and the smallest fix.',
  },
  {
    id: 'context-map',
    label: 'Context map',
    alt: 'Preflight context map: a treemap of instruction text by resource',
    text: 'A treemap of the instruction text each resource can put in front of the model.',
  },
  {
    id: 'resources',
    label: 'Resources',
    alt: 'Preflight resource list across skills, MCP servers and other types',
    text: 'Skills, MCP servers, agents, hooks and plugins in one inventory, by scope and agent.',
  },
];

export function Shots() {
  return (
    <Tabs defaultValue={SHOTS[0].id} className="gap-0">
      <TabsList aria-label="Screens" className="h-auto flex-wrap">
        {SHOTS.map((x) => (
          <TabsTrigger key={x.id} value={x.id} className="px-3 py-1.5">
            {x.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {SHOTS.map((x, n) => (
        <TabsContent key={x.id} value={x.id}>
          <p className="pf-shot-text">{x.text}</p>
          <Card className="pf-window gap-0 py-0">
            <div className="pf-window-bar" aria-hidden="true">
              <i /><i /><i />
            </div>
            {/* eslint-disable @next/next/no-img-element */}
            <img
              className="pf-shot pf-light-only"
              src={`/img/screens/${x.id}-light.webp`}
              alt={x.alt}
              width={1280}
              height={800}
              loading={n === 0 ? 'eager' : 'lazy'}
            />
            <img
              className="pf-shot pf-dark-only"
              src={`/img/screens/${x.id}-dark.webp`}
              alt={x.alt}
              width={1280}
              height={800}
              loading={n === 0 ? 'eager' : 'lazy'}
            />
            {/* eslint-enable @next/next/no-img-element */}
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  );
}
