import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { initTodoLedger, ledgerHolder } from '../../../src/todo.js';
import { MemoryStore } from '../../../src/store/memory.store.js';
import { createTodosRouter } from '../../../src/web/routes/todos.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', createTodosRouter());
  return app;
}

beforeEach(() => {
  // Fresh in-memory store + ledger for each test
  initTodoLedger(new MemoryStore());
});

describe('GET /api/todos', () => {
  it('returns empty array when no todos', async () => {
    const res = await request(buildApp()).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns todos after adding via ledger', async () => {
    ledgerHolder.instance.add({ task: 'Test task', bucket: 'short-term', priority: 'high' });
    const res = await request(buildApp()).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].task).toBe('Test task');
    expect(res.body[0].id).toBeTruthy();
  });
});

describe('POST /api/todos', () => {
  it('creates a todo and returns 201 with the item', async () => {
    const res = await request(buildApp())
      .post('/')
      .send({ task: 'Write specs', bucket: 'short-term', priority: 'medium' });

    expect(res.status).toBe(201);
    expect(res.body.task).toBe('Write specs');
    expect(res.body.source).toBe('web');
    expect(res.body.id).toBeTruthy();
    expect(res.body.createdAt).toBeTruthy();
  });

  it('persists the todo into the ledger', async () => {
    await request(buildApp())
      .post('/')
      .send({ task: 'Deploy service', bucket: 'long-term', priority: 'low' });

    const all = ledgerHolder.instance.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].task).toBe('Deploy service');
  });

  it('returns 400 when task is missing', async () => {
    const res = await request(buildApp())
      .post('/')
      .send({ bucket: 'short-term', priority: 'high' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/task/);
  });

  it('returns 400 when task is empty string', async () => {
    const res = await request(buildApp())
      .post('/')
      .send({ task: '   ', bucket: 'short-term', priority: 'high' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid bucket', async () => {
    const res = await request(buildApp())
      .post('/')
      .send({ task: 'Foo', bucket: 'invalid', priority: 'high' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/bucket/);
  });

  it('returns 400 for invalid priority', async () => {
    const res = await request(buildApp())
      .post('/')
      .send({ task: 'Foo', bucket: 'short-term', priority: 'critical' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/priority/);
  });
});

describe('PATCH /api/todos/:id', () => {
  it('updates a todo status and returns ok', async () => {
    const item = ledgerHolder.instance.add({ task: 'A task', bucket: 'short-term', priority: 'medium' });
    const res = await request(buildApp())
      .patch(`/${item.id}`)
      .send({ status: 'done' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(ledgerHolder.instance.getAll()[0].status).toBe('done');
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(buildApp())
      .patch('/nonexistent')
      .send({ status: 'done' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when no patchable fields are provided', async () => {
    const item = ledgerHolder.instance.add({ task: 'A task', bucket: 'short-term', priority: 'low' });
    const res = await request(buildApp())
      .patch(`/${item.id}`)
      .send({ source: 'web', createdAt: 'ignored', id: 'ignored' });
    expect(res.status).toBe(400);
  });

  it('silently ignores non-patchable fields', async () => {
    const item = ledgerHolder.instance.add({ task: 'B task', bucket: 'short-term', priority: 'low' });
    const res = await request(buildApp())
      .patch(`/${item.id}`)
      .send({ status: 'in-progress', id: 'hacked', source: 'injected' });
    expect(res.status).toBe(200);
    // id should not be modified
    expect(ledgerHolder.instance.getAll()[0].id).toBe(item.id);
  });
});

describe('DELETE /api/todos/:id', () => {
  it('removes an existing todo', async () => {
    const item = ledgerHolder.instance.add({ task: 'Remove me', bucket: 'short-term', priority: 'low' });
    const res = await request(buildApp()).delete(`/${item.id}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(ledgerHolder.instance.getAll()).toHaveLength(0);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(buildApp()).delete('/ghost');
    expect(res.status).toBe(404);
  });
});
