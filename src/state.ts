import {copyFile, mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {AdkConfigSchema, ResourceSchema, defaultConfig, type AdkConfig, type Resource, type Scope} from './schema.js';

export type DiffKind = 'add' | 'replace' | 'unchanged' | 'remove';
export interface DiffEntry {kind: DiffKind; resource: Resource; previous?: Resource}

function comparable(resource: Resource): string {
  return JSON.stringify(resource, Object.keys(resource).sort());
}

export function diffResources(current: Resource[], desired: Resource[], prune = false): DiffEntry[] {
  const byId = new Map(current.map((resource) => [resource.id, resource]));
  const entries: DiffEntry[] = desired.map((resource) => {
    const previous = byId.get(resource.id);
    if (!previous) return {kind: 'add', resource};
    return comparable(previous) === comparable(resource)
      ? {kind: 'unchanged', resource, previous}
      : {kind: 'replace', resource, previous};
  });
  if (prune) {
    const desiredIds = new Set(desired.map(({id}) => id));
    entries.push(...current.filter(({id}) => !desiredIds.has(id)).map((resource) => ({kind: 'remove' as const, resource, previous: resource})));
  }
  return entries;
}

export class ConfigStore {
  readonly configPath: string;
  readonly lockPath: string;
  readonly auditPath: string;

  constructor(readonly root: string) {
    this.configPath = join(root, 'adk.config.json');
    this.lockPath = join(root, 'adk.lock.json');
    this.auditPath = join(root, '.adk', 'audit.jsonl');
  }

  async init(): Promise<AdkConfig> {
    await mkdir(this.root, {recursive: true});
    try {
      return await this.read();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const config = defaultConfig();
      await this.write(config, false);
      return config;
    }
  }

  async read(): Promise<AdkConfig> {
    return AdkConfigSchema.parse(JSON.parse(await readFile(this.configPath, 'utf8')));
  }

  async write(config: AdkConfig, backup = true): Promise<void> {
    const validated = AdkConfigSchema.parse(config);
    await mkdir(dirname(this.configPath), {recursive: true});
    if (backup) {
      try { await copyFile(this.configPath, `${this.configPath}.bak`); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    const temporary = `${this.configPath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, {mode: 0o600});
    await rename(temporary, this.configPath);
  }

  async resources(profileName?: string): Promise<Resource[]> {
    const config = await this.read();
    const name = profileName ?? config.activeProfile;
    const profile = config.profiles[name];
    if (!profile) throw new Error(`Profile not found: ${name}`);
    return profile.resources;
  }

  async get(id: string, profileName?: string): Promise<Resource> {
    const resource = (await this.resources(profileName)).find((candidate) => candidate.id === id);
    if (!resource) throw new Error(`Resource not found: ${id}`);
    return resource;
  }

  async create(input: Resource, profileName?: string): Promise<Resource> {
    const resource = ResourceSchema.parse(input);
    return this.mutate(profileName, (resources) => {
      if (resources.some(({id}) => id === resource.id)) throw new Error(`Resource already exists: ${resource.id}`);
      resources.push(resource);
      return resource;
    });
  }

  async update(id: string, patch: Partial<Resource>, profileName?: string): Promise<Resource> {
    return this.mutate(profileName, (resources) => {
      const index = resources.findIndex((resource) => resource.id === id);
      if (index < 0) throw new Error(`Resource not found: ${id}`);
      const resource = ResourceSchema.parse({...resources[index], ...patch, id});
      resources[index] = resource;
      return resource;
    });
  }

  async move(id: string, scope: Scope, profileName?: string): Promise<Resource> {
    return this.update(id, {scope}, profileName);
  }

  async remove(id: string, profileName?: string): Promise<Resource> {
    return this.mutate(profileName, (resources) => {
      const index = resources.findIndex((resource) => resource.id === id);
      if (index < 0) throw new Error(`Resource not found: ${id}`);
      return resources.splice(index, 1)[0]!;
    });
  }

  async createProfile(name: string, from?: string): Promise<void> {
    const config = await this.read();
    if (config.profiles[name]) throw new Error(`Profile already exists: ${name}`);
    const source = from ? config.profiles[from] : undefined;
    if (from && !source) throw new Error(`Profile not found: ${from}`);
    config.profiles[name] = source ? structuredClone(source) : {description: '', resources: []};
    await this.write(config);
  }

  async switchProfile(name: string): Promise<void> {
    const config = await this.read();
    if (!config.profiles[name]) throw new Error(`Profile not found: ${name}`);
    config.activeProfile = name;
    await this.write(config);
  }

  async profileDiff(left: string, right: string): Promise<DiffEntry[]> {
    const config = await this.read();
    if (!config.profiles[left] || !config.profiles[right]) throw new Error('Profile not found');
    return diffResources(config.profiles[left].resources, config.profiles[right].resources, true);
  }

  private async mutate<T>(profileName: string | undefined, change: (resources: Resource[]) => T): Promise<T> {
    const config = await this.read();
    const name = profileName ?? config.activeProfile;
    const profile = config.profiles[name];
    if (!profile) throw new Error(`Profile not found: ${name}`);
    const result = change(profile.resources);
    await this.write(config);
    return result;
  }
}
