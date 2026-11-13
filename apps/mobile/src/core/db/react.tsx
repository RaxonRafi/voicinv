import { createContext, type ReactNode, use, useEffect, useState } from 'react';

import { type Database, type Orm } from './database';
import { type TableName } from './schema';

const DatabaseContext = createContext<Database | null>(null);

interface DatabaseProviderProps {
  database: Database;
  children: ReactNode;
}

/** Makes the opened database available to hooks. Tests pass an in-memory database. */
export function DatabaseProvider({ database, children }: DatabaseProviderProps) {
  return <DatabaseContext value={database}>{children}</DatabaseContext>;
}

export function useDatabase(): Database {
  const database = use(DatabaseContext);
  if (!database) throw new Error('useDatabase must be used inside <DatabaseProvider>');
  return database;
}

export type LiveQueryState<T> =
  | { status: 'loading'; data: undefined; error: undefined }
  | { status: 'ready'; data: T; error: undefined }
  | { status: 'error'; data: undefined; error: Error };

const LOADING = { status: 'loading', data: undefined, error: undefined } as const;

/**
 * Runs a read query and re-runs it whenever one of `tables` is changed by a committed
 * transaction. The database is the source of truth; screens never copy its data into stores.
 *
 * `key` identifies the query: pass every value the query depends on (IDs, filters), as a string.
 */
export function useLiveQuery<T>(
  key: string,
  tables: readonly TableName[],
  query: (orm: Orm) => Promise<T>,
): LiveQueryState<T> {
  const database = useDatabase();
  const [state, setState] = useState<LiveQueryState<T>>(LOADING);
  const [request, setRequest] = useState({ key, query });
  // The query function is recreated on every render; only a changed key means a new query.
  if (request.key !== key) {
    setRequest({ key, query });
    setState(LOADING);
  }
  const tableKey = tables.join(',');

  useEffect(() => {
    let active = true;
    const watched = new Set<string>(tableKey.split(','));

    const run = () => {
      request.query(database.orm).then(
        (data) => {
          if (active) setState({ status: 'ready', data, error: undefined });
        },
        (error: unknown) => {
          if (!active) return;
          const cause = error instanceof Error ? error : new Error(String(error));
          setState({ status: 'error', data: undefined, error: cause });
        },
      );
    };

    run();
    const unsubscribe = database.subscribe((changed) => {
      for (const table of changed) {
        if (watched.has(table)) {
          run();
          return;
        }
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [database, request, tableKey]);

  return state;
}
