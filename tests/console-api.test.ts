/**
 * The console HTTP API as the settings window uses it (console/), against a real Cortico bot: the
 * routes, the request shapes they take and the fields of the replies the window reads. A Cortico
 * change to one of these fails here. The bot is Cormini with a `probe` World standing in for the
 * desktop-pet World's panel and stream; delivery stays paused, so no model is called.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WebSocket } from 'ws';
import { createBot, type Bot, type BotDefinition } from 'cortico/bot.ts';
import type { CoreConfig, WorldStreamSocket } from 'cortico/core/types.ts';
import { loadDeployment } from 'cortico/deploy.ts';
import { withWorlds, type WorldDefinition } from 'cortico/world.ts';
import { TERMINAL } from 'cortico/worlds/terminal/definition.ts';

const CORTICO = resolve(import.meta.dirname, '../vendor/cortico');
const PROBE_PAGE = 'world:probe';
const LANGUAGE_KIND = 'probe.language';

/** Stands in for the desktop-pet World: one panel whose methods echo, and a stream that greets and echoes. */
const PROBE: WorldDefinition = {
  id: 'probe',
  label: 'Probe',
  defaults: () => ({ enabled: false }),
  configOptions: (kind) => (kind === LANGUAGE_KIND ? [{ value: 'en', label: 'English' }] : []),
  create: () => ({
    id: 'probe',
    envPromptVars: () => ({}),
    tools: () => [],
    start: async () => {},
    stop: async () => {},
    console: () => ({
      panels: [{ id: 'pet', title: 'Pet' }],
      invoke: async (_panel: string, method: string, args: unknown[]) => {
        if (method === 'fail') throw new Error('probe failed');
        return { method, args };
      },
      stream: (_panel: string, socket: WorldStreamSocket) => {
        socket.send(JSON.stringify({ type: 'hello' }));
        socket.onMessage((text) => socket.send(text));
      },
    }),
  }),
};

let dir: string;
let bot: Bot<CoreConfig>;
let base: string;

const get = (path: string) => fetch(`${base}${path}`);
const post = (path: string, body?: unknown) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body ?? {}),
});
const json = async (res: Response) => ({ status: res.status, body: await res.json() as Record<string, any> });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'coo-console-api-'));
  mkdirSync(join(dir, 'providers', 'fixture'), { recursive: true });
  // a closed local port: the endpoint test fails without leaving the machine
  writeFileSync(join(dir, 'providers', 'fixture', 'config.json'), JSON.stringify({ kind: 'openai-responses-compat', baseUrl: 'http://127.0.0.1:9/v1', spec: { model: 'test-model', thinking: false } }));
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ activeProvider: 'fixture' }));
  const cormini = (await import(join(CORTICO, 'bots', 'cormini', 'index.ts'))).default as BotDefinition<CoreConfig>;
  const definition = withWorlds({ ...cormini, declares: [...(cormini.declares ?? []), PROBE.id] }, [TERMINAL, PROBE] as WorldDefinition[]);
  const loaded = loadDeployment(definition, dir, CORTICO);
  loaded.config.web.port = 0;
  bot = createBot(loaded, definition);
  bot.core.bus.setPaused(true);
  base = `http://127.0.0.1:${(await bot.start()).port}`;
}, 30000);

afterAll(async () => {
  await bot?.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe('the console API the settings window reads', () => {
  it('status: the name, whether the run is paused, and the active endpoint', async () => {
    const { status, body } = await json(await get('/api/status'));
    expect(status).toBe(200);
    expect(body.displayName).toEqual(expect.any(String));
    expect(body.loop.paused).toBe(true);
    expect(body.modelConnection).toMatchObject({ ready: expect.any(Boolean), name: 'fixture', model: 'test-model', moduleTitle: expect.any(String), baseUrl: 'http://127.0.0.1:9/v1' });
  });

  it('capabilities: a table of booleans with the surfaces the window uses', async () => {
    const { body } = await json(await get('/api/capabilities'));
    for (const key of ['run', 'shutdown', 'storage', 'prompts']) expect(body.capabilities[key]).toBe(true);
  });

  it('config: groups with values, a write by group, and the options of a choice', async () => {
    const before = await json(await get('/api/config'));
    const core = before.body.groups.find((g: { group: { id: string } }) => g.group.id === 'core');
    expect(core.values.displayName).toEqual(expect.any(String));
    const written = await json(await post('/api/config', { group: 'core', values: { displayName: 'Probe bot' } }));
    expect(written).toMatchObject({ status: 200, body: { result: expect.any(String) } });
    const after = await json(await get('/api/config'));
    expect(after.body.groups.find((g: { group: { id: string } }) => g.group.id === 'core').values.displayName).toBe('Probe bot');
    expect((await json(await post('/api/config', { group: 'no-such-group', values: {} }))).body.error).toEqual(expect.any(String));
    const options = await json(await get(`/api/config/options/${LANGUAGE_KIND}`));
    expect(options.body.options).toEqual([{ value: 'en', label: 'English' }]);
  });

  it('theme: no record until one is written, then the record as saved', async () => {
    const empty = await json(await get('/api/theme'));
    expect(empty.body).toEqual({ defaultScheme: expect.any(String), theme: null });
    const record = { selectedId: 'mint', mode: 'dark', custom: [] };
    const saved = await json(await post('/api/theme', record));
    expect(saved.body).toMatchObject({ ok: true, theme: record });
    expect((await json(await get('/api/theme'))).body.theme).toMatchObject(record);
  });

  it('avatar: a PNG written by POST is served by GET; anything else is refused', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
    const up = await fetch(`${base}/api/avatar`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png });
    expect((await json(up)).body.ok).toBe(true);
    const down = await get('/api/avatar');
    expect(down.headers.get('content-type')).toMatch(/^image\/png/);
    expect(Buffer.from(await down.arrayBuffer()).equals(png)).toBe(true);
    const bad = await fetch(`${base}/api/avatar`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: Buffer.from('not a png') });
    expect(bad.status).toBe(400);
  });

  it('blob: an unknown handle is 404', async () => {
    expect((await get('/api/blob?handle=log%3Anone')).status).toBe(404);
  });

  it('prompts: documents with a revision; a write with a stale revision is 409', async () => {
    const { body } = await json(await get('/api/prompts'));
    const constitution = body.prompts.find((p: { key: string }) => p.key === 'constitution');
    expect(constitution).toMatchObject({ key: 'constitution', title: expect.any(String), content: expect.any(String), revision: expect.any(String) });
    const saved = await json(await post('/api/prompts', { key: 'constitution', content: 'Probe persona\n', baseRevision: constitution.revision }));
    expect(saved).toMatchObject({ status: 200, body: { result: expect.any(String), revision: expect.any(String) } });
    const stale = await json(await post('/api/prompts', { key: 'constitution', content: 'Again\n', baseRevision: constitution.revision }));
    expect(stale.status).toBe(409);
    expect(stale.body.error).toEqual(expect.any(String));
  });

  it('usage: totals, a series and the breakdowns, empty before any model call', async () => {
    const { body } = await json(await get('/api/usage?bucket=day&days=7'));
    expect(body).toMatchObject({ currency: expect.any(String), bucket: expect.any(String), series: expect.any(Array), byRole: expect.any(Array), byModel: expect.any(Array) });
    expect('totals' in body).toBe(true);
  });

  it('panel methods: POST with { args } returns what the method returns; a throw is a status with { error }', async () => {
    const route = `/api/console/providers/${encodeURIComponent(PROBE_PAGE)}/panels/pet`;
    expect((await json(await post(`${route}/state`, { args: [1, 'two'] }))).body).toEqual({ method: 'state', args: [1, 'two'] });
    const failed = await json(await post(`${route}/fail`, { args: [] }));
    expect(failed.status).toBeGreaterThanOrEqual(400);
    expect(failed.body.error).toEqual(expect.any(String));
  });

  it('panel stream: a WebSocket on the panel route carries the World\'s frames both ways', async () => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws/providers/${encodeURIComponent(PROBE_PAGE)}/panels/pet?language=en`, { headers: { Origin: base } });
    const frames: string[] = [];
    await new Promise<void>((done, fail) => {
      ws.on('message', (data) => {
        frames.push(String(data));
        if (frames.length === 1) ws.send('{"type":"echo"}');
        else { ws.close(); done(); }
      });
      ws.on('error', fail);
    });
    expect(frames).toEqual(['{"type":"hello"}', '{"type":"echo"}']);
  });

  it('a write from another origin is refused', async () => {
    const res = await fetch(`${base}/api/run/pause`, { method: 'POST', headers: { Origin: 'http://elsewhere.test' } });
    expect(res.status).toBe(403);
  });

  it('endpoints: the list, one endpoint with its revision, a test that reports failure in its reply', async () => {
    const list = await json(await get('/api/providers'));
    expect(list.body.providers.map((p: { name: string }) => p.name)).toContain('fixture');
    const detail = await json(await get('/api/providers/fixture'));
    expect(detail.body).toMatchObject({ name: 'fixture', entry: expect.any(Object), revision: expect.any(String) });
    const test = await json(await post('/api/providers/fixture/test', {}));
    expect(test.body.ok).toBe(false);
    expect(test.body.error ?? test.body.hint).toEqual(expect.any(String));
  }, 30000);

  it('storage: clearing the session part answers with a result line', async () => {
    const { status, body } = await json(await post('/api/storage/clear?key=session'));
    expect(status).toBe(200);
    expect(body.result).toEqual(expect.any(String));
  });

  // last: resuming delivers what waited and starts a model call
  it('run: resume and pause answer with the new state', async () => {
    expect((await json(await post('/api/run/resume'))).body).toMatchObject({ paused: false, result: expect.any(String) });
    expect((await json(await post('/api/run/pause'))).body).toMatchObject({ paused: true, result: expect.any(String) });
  });
});
