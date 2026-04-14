/**
 * @module taskExport
 * Back-compat shim — real implementation lives in ./task-export/index.ts
 * Existing imports (e.g. tests, ActionsSection) continue to work via this barrel.
 */
export {
  taskToMarkdown,
  exportTaskAsMarkdown,
  tasksToJson,
  exportTaskAsJson,
  importTasksFromJson,
  EXPORT_FORMAT_VERSION,
} from './task-export/index';
export type { ImportResult, TaskExportJson } from './task-export/index';
