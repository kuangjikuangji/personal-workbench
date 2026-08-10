import 'fake-indexeddb/auto';
import { WorkbenchDatabase } from '../db/database';
import { createLocalRepositories } from '../db/localRepositories';

export function createTestRepositories() {
  const db = new WorkbenchDatabase(`test-${crypto.randomUUID()}`);

  return createLocalRepositories(db);
}
