import { Router } from 'express';
import { ledgerHolder } from '../../todo';
import type { Bucket, Priority, TodoItem } from '../../types';

const VALID_BUCKETS: readonly Bucket[] = ['short-term', 'long-term'];
const VALID_PRIORITIES: readonly Priority[] = ['high', 'medium', 'low'];
const PATCHABLE = ['task', 'status', 'priority', 'bucket', 'eta', 'owner'] as const;

export function createTodosRouter(): Router {
  const router = Router();

  // GET /api/todos — return all todos
  router.get('/', (_req, res) => {
    res.json(ledgerHolder.instance.getAll());
  });

  // POST /api/todos — add a new todo (source='web')
  router.post('/', (req, res) => {
    const body = req.body as Record<string, unknown>;

    if (typeof body.task !== 'string' || !body.task.trim()) {
      return res.status(400).json({ error: 'task must be a non-empty string' });
    }
    if (!VALID_BUCKETS.includes(body.bucket as Bucket)) {
      return res.status(400).json({ error: 'bucket must be short-term or long-term' });
    }
    if (!VALID_PRIORITIES.includes(body.priority as Priority)) {
      return res.status(400).json({ error: 'priority must be high, medium, or low' });
    }

    const item = ledgerHolder.instance.add({
      task: body.task.trim(),
      bucket: body.bucket as Bucket,
      priority: body.priority as Priority,
      owner: typeof body.owner === 'string' ? body.owner : undefined,
      eta: typeof body.eta === 'string' ? body.eta : undefined,
      source: 'web',
    });

    return res.status(201).json(item);
  });

  // PATCH /api/todos/:id — update mutable fields
  router.patch('/:id', (req, res) => {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;

    const updates = Object.fromEntries(
      Object.entries(body).filter(([k]) => (PATCHABLE as readonly string[]).includes(k))
    ) as Partial<Omit<TodoItem, 'id'>>;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'no patchable fields provided' });
    }

    const found = ledgerHolder.instance.update(id, updates);
    if (!found) return res.status(404).json({ error: 'not found' });
    return res.json({ ok: true });
  });

  // DELETE /api/todos/:id — remove a todo
  router.delete('/:id', (req, res) => {
    const removed = ledgerHolder.instance.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'not found' });
    return res.json({ ok: true });
  });

  return router;
}
