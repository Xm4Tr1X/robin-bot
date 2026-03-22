#!/usr/bin/env node
/**
 * Quick script to list todos from the database
 */
import { SqliteStore } from '../src/store/sqlite.store';
import { initTodoLedger, ledgerHolder } from '../src/todo';
import { getConfig } from '../src/config';

async function listTodos() {
  const config = getConfig();
  const store = new SqliteStore(config.settings.dbPath);

  // Initialize the todo ledger with the store
  initTodoLedger(store);
  const ledger = ledgerHolder.instance;

  console.log('\n📋 Current Todos:\n');
  console.log(ledger.formatForSlack());
  console.log();

  store.close();
}

listTodos().catch((err) => {
  console.error('Failed to list todos:', err);
  process.exit(1);
});
