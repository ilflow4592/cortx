/**
 * SQLite data access layer — backwards-compatible barrel re-exports.
 *
 * Module was split into `db/` for maintainability. Existing callers that import
 * from `../services/db` continue to work via these re-exports.
 */
export * from './db/connection';
export * from './db/projects';
export * from './db/tasks';
export * from './db/search';
export * from './db/migration';
