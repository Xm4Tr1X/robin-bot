import express from 'express';
import path from 'path';
import http from 'http';
import type { DurableStore } from '../store/store.contract';
import { createTodosRouter } from './routes/todos';
import { createSettingsRouter } from './routes/settings';
import { getConfig } from '../config';

export function createWebServer(_store: DurableStore): http.Server {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.use('/api/todos', createTodosRouter());
  app.use('/api/settings', createSettingsRouter());

  // Serve static SPA — public/ is two levels up from src/web/
  app.use(express.static(path.join(__dirname, '../../public')));

  const port = getConfig().settings.webPort;
  return app.listen(port, '127.0.0.1') as http.Server;
}
