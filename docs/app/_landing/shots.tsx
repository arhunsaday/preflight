'use client';

import { useState } from 'react';

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
  const [i, setI] = useState(0);
  const s = SHOTS[i];
  return (
    <div className="pf-shots">
      <div className="pf-tabs" role="tablist" aria-label="Screens">
        {SHOTS.map((x, n) => (
          <button
            key={x.id}
            role="tab"
            type="button"
            aria-selected={n === i}
            className={n === i ? 'on' : ''}
            onClick={() => setI(n)}
          >
            {x.label}
          </button>
        ))}
      </div>
      <p className="pf-shot-text">{s.text}</p>
      <div className="pf-window">
        <div className="pf-window-bar" aria-hidden="true">
          <i /><i /><i />
        </div>
        {SHOTS.map((x, n) => (
          <div key={x.id} hidden={n !== i}>
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
          </div>
        ))}
      </div>
    </div>
  );
}
