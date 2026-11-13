import { type Migration } from '../migrator';
import { initial } from './0001-initial';

/**
 * Every migration, oldest first. Migrations are append-only: never edit or reorder one that has
 * shipped; add a new one instead.
 */
export const MIGRATIONS: readonly Migration[] = [initial];
