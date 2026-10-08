import { describe, expect, it } from 'vitest';
import { DEFAULT_MODELS } from './constants';
import {
  loadConnectionFile,
  removeConnection,
  saveConnectionFile,
  selectDefault,
  upsertConnection,
  validateConnection,
  wireAgent,
  type ConnectionFile,
  type KeyValueStore,
} from './connections';

function memory(): KeyValueStore & { dump: Record<string, string> } {
  const dump: Record<string, string> = {};
  return {
    dump,
    getItem: (key) => (key in dump ? dump[key] : null),
    setItem: (key, value) => { dump[key] = value; },
  };
}

describe('model connections', () => {
  it('copies a legacy configuration without dropping the key, URL, or model', () => {
    const store = memory();
    store.setItem('byok-config', JSON.stringify({
      provider: 'qwen',
      apiKey: 'sk-kept',
      baseUrl: 'https://example.com/v1',
      model: 'glm-5.3',
      modelPinned: true,
    }));
    const file = loadConnectionFile(store);
    expect(file.connections).toHaveLength(1);
    expect(file.connections[0]).toMatchObject({
      name: 'Qwen Cloud',
      apiKey: 'sk-kept',
      baseUrl: 'https://example.com/v1',
      model: 'glm-5.3',
    });
    expect(file.defaultId).toBe(file.connections[0].id);
    const again = loadConnectionFile(store);
    expect(again).toEqual(file);
  });

  it('keeps the saved file across a reload', () => {
    const store = memory();
    const first = upsertConnection({ defaultId: '', connections: [] }, {
      name: 'Studio',
      baseUrl: 'https://example.com/v1',
      apiKey: 'key-a',
      model: 'model-a',
    });
    if ('error' in first) throw new Error(first.error);
    const second = upsertConnection(first.file, {
      name: 'Other',
      baseUrl: 'https://other.example/v1',
      apiKey: 'key-b',
      model: 'model-b',
    });
    if ('error' in second) throw new Error(second.error);
    const selected = selectDefault(second.file, second.id);
    saveConnectionFile(store, selected);
    expect(loadConnectionFile(store)).toEqual(selected);
  });

  it('rejects a connection that cannot be called', () => {
    expect(validateConnection({ name: '', baseUrl: 'https://example.com/v1', model: 'm' })).toBe('Add a connection name.');
    expect(validateConnection({ name: 'A', baseUrl: 'http://example.com/v1', model: 'm' })).toBe('Only https endpoints are allowed.');
    expect(validateConnection({ name: 'A', baseUrl: 'https://example.com/v1', model: '' })).toBe('Add a model ID.');
  });

  it('sends each agent to its own connection and does not attach another connection key', () => {
    const file: ConnectionFile = {
      defaultId: 'a',
      connections: [
        { id: 'a', name: 'A', baseUrl: 'https://a.example/v1', apiKey: 'key-a', model: 'model-a' },
        { id: 'b', name: 'B', baseUrl: 'https://b.example/v1', apiKey: 'key-b', model: 'model-b' },
      ],
    };
    const lead = wireAgent({ name: 'Lead', description: 'Leads.', model: 'model-a' }, file);
    const worker = wireAgent({ name: 'Worker', description: 'Writes.', connectionId: 'b', model: 'custom-model' }, file);
    const missing = wireAgent({ name: 'Spare', description: 'Spare.', connectionId: 'gone', model: 'model-a' }, file);
    expect(lead.apiKey).toBeUndefined();
    expect(lead.baseUrl).toBeUndefined();
    expect(worker).toMatchObject({ baseUrl: 'https://b.example/v1', apiKey: 'key-b', model: 'custom-model' });
    expect(JSON.stringify(lead)).not.toContain('key-b');
    expect(missing.apiKey).toBeUndefined();
    expect(JSON.stringify(missing)).not.toContain('key-b');
  });

  it('sends an empty key for a non-default connection instead of the default key', () => {
    const file: ConnectionFile = {
      defaultId: 'a',
      connections: [
        { id: 'a', name: 'A', baseUrl: 'https://a.example/v1', apiKey: 'key-a', model: 'model-a' },
        { id: 'b', name: 'B', baseUrl: 'https://b.example/v1', apiKey: '', model: 'model-b' },
      ],
    };
    const wired = wireAgent({ name: 'Worker', description: 'Writes.', connectionId: 'b' }, file);
    expect(wired.apiKey).toBe('');
    expect(wired.baseUrl).toBe('https://b.example/v1');
    expect(wired.model).toBe('model-b');
  });

  it('uses the connection model when an agent has only the built-in placeholder model', () => {
    const file: ConnectionFile = {
      defaultId: 'a',
      connections: [
        { id: 'a', name: 'A', baseUrl: 'https://integrate.api.nvidia.com/v1', apiKey: 'nvapi-a', model: 'qwen/qwen3.5-122b-a10b' },
        { id: 'b', name: 'B', baseUrl: 'https://b.example/v1', apiKey: 'key-b', model: 'model-b' },
      ],
    };
    const onDefault = wireAgent({ name: 'Lead', description: 'Leads.', model: DEFAULT_MODELS.text }, file);
    const onOwn = wireAgent({ name: 'Worker', description: 'Writes.', connectionId: 'b', model: DEFAULT_MODELS.text }, file);
    const noConnection = wireAgent({ name: 'Lead', description: 'Leads.', model: DEFAULT_MODELS.text }, { defaultId: '', connections: [] });
    expect(onDefault.model).toBeUndefined();
    expect(onOwn.model).toBe('model-b');
    expect(noConnection.model).toBeUndefined();
  });

  it('clears the legacy key copy when the last connection is removed', () => {
    const storage = memory();
    const created = upsertConnection({ defaultId: '', connections: [] }, {
      name: 'A', baseUrl: 'https://a.example/v1', apiKey: 'sk-secret', model: 'model-a',
    });
    if ('error' in created) throw new Error(created.error);
    saveConnectionFile(storage, created.file);
    expect(storage.dump['byok-config']).toContain('sk-secret');
    saveConnectionFile(storage, removeConnection(created.file, created.id));
    expect(storage.dump['byok-config']).not.toContain('sk-secret');
    expect(loadConnectionFile(storage).connections).toEqual([]);
  });

  it('moves the default when the selected connection is removed', () => {
    const file: ConnectionFile = {
      defaultId: 'a',
      connections: [
        { id: 'a', name: 'A', baseUrl: 'https://a.example/v1', apiKey: 'key-a', model: 'model-a' },
        { id: 'b', name: 'B', baseUrl: 'https://b.example/v1', apiKey: 'key-b', model: 'model-b' },
      ],
    };
    expect(removeConnection(file, 'a').defaultId).toBe('b');
  });
});
