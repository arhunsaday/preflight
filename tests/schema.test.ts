import {describe, expect, it} from 'vitest';
import {AdkConfigSchema, SharePayloadSchema} from '../src/schema.js';

describe('configuration schema', () => {
  it('accepts every supported resource type with stable identity and source', () => {
    const types = ['skill', 'mcp', 'subagent', 'hook', 'prompt', 'tool', 'plugin', 'statusline', 'command'];
    const config = AdkConfigSchema.parse({
      version: 1,
      activeProfile: 'default',
      profiles: {
        default: {
          resources: types.map((type) => ({
            id: `${type}:example`, type, name: `Example ${type}`, source: 'file:///example',
            scope: 'project', harnesses: ['claude-code'], enabled: true, config: {},
          })),
        },
      },
    });
    expect(config.profiles.default?.resources).toHaveLength(types.length);
  });

  it('rejects literal secret values in shares but accepts environment references', () => {
    const base = {
      version: 1,
      ownerId: 'local',
      visibility: 'unlisted',
      createdAt: '2026-09-23T00:00:00.000Z',
      resources: [{
        id: 'mcp:grafana', type: 'mcp', name: 'Grafana', source: 'https://example.test/grafana',
        scope: 'project', harnesses: ['claude-code'], enabled: true,
        config: {env: {GRAFANA_TOKEN: '${GRAFANA_TOKEN}'}},
      }],
    };
    expect(SharePayloadSchema.parse(base)).toBeTruthy();
    expect(() => SharePayloadSchema.parse({
      ...base,
      resources: [{...base.resources[0], config: {env: {GRAFANA_TOKEN: 'literal-value'}}}],
    })).toThrow(/secret/i);
  });
});
