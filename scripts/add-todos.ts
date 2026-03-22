#!/usr/bin/env node
/**
 * Quick script to add todos to the database
 */
import { SqliteStore } from '../src/store/sqlite.store';
import { initTodoLedger, ledgerHolder } from '../src/todo';
import { getConfig } from '../src/config';

async function addTodos() {
  const config = getConfig();
  const store = new SqliteStore(config.settings.dbPath);

  // Initialize the todo ledger with the store
  initTodoLedger(store);
  const ledger = ledgerHolder.instance;

  // Add the three todos
  const todo1 = ledger.add({
    task: 'closure of DMS for DBS',
    bucket: 'short-term',
    priority: 'high',
    source: 'cli',
  });

  const todo2 = ledger.add({
    task: 'look at unblocking repo',
    bucket: 'short-term',
    priority: 'medium',
    source: 'cli',
  });

  const todo3 = ledger.add({
    task: 'move kaya + 1 more to DCS',
    bucket: 'short-term',
    priority: 'medium',
    source: 'cli',
  });

  console.log('✓ Added todos:');
  console.log(`  [${todo1.id}] ${todo1.task}`);
  console.log(`  [${todo2.id}] ${todo2.task}`);
  console.log(`  [${todo3.id}] ${todo3.task}`);

  store.close();
}

addTodos().catch((err) => {
  console.error('Failed to add todos:', err);
  process.exit(1);
});
