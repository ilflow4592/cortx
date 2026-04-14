/**
 * Per-project pipeline customization.
 *
 * Projects can override phase labels and model assignments by creating
 * `.cortx/pipeline.json` in the project root:
 *
 * {
 *   "names": {
 *     "grill_me": "Requirements",
 *     "dev_plan": "Design",
 *     "implement": "Code"
 *   },
 *   "models": {
 *     "implement": "Opus",
 *     "dev_plan": "Sonnet"
 *   },
 *   "hidden": ["obsidian_save"]
 * }
 *
 * Any fields left unset fall back to the global defaults from
 * src/constants/pipeline.ts. Phase order and total phase set are NOT
 * customizable yet (pipeline skills emit specific phase names).
 */
import { useProjectStore } from '../stores/projectStore';
import { useTaskStore } from '../stores/taskStore';
import {
  PHASE_NAMES as DEFAULT_NAMES,
  PHASE_MODELS as DEFAULT_MODELS,
  PHASE_ORDER,
} from '../constants/pipeline';
import type { PipelinePhase } from '../types/task';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

export interface PipelineConfig {
  names: Record<PipelinePhase, string>;
  models: Record<PipelinePhase, string>;
  hidden: Set<PipelinePhase>;
}

interface RawConfig {
  names?: Partial<Record<PipelinePhase, string>>;
  models?: Partial<Record<PipelinePhase, string>>;
  hidden?: PipelinePhase[];
}

const cache = new Map<string, PipelineConfig>();

function defaults(): PipelineConfig {
  return {
    names: { ...DEFAULT_NAMES },
    models: { ...DEFAULT_MODELS },
    hidden: new Set(),
  };
}

export async function loadPipelineConfig(projectPath: string): Promise<PipelineConfig> {
  if (!projectPath) return defaults();
  if (cache.has(projectPath)) return cache.get(projectPath)!;

  try {
    const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
      cwd: projectPath,
      command: 'cat .cortx/pipeline.json 2>/dev/null',
    });
    if (!result.success || !result.output.trim()) {
      const cfg = defaults();
      cache.set(projectPath, cfg);
      return cfg;
    }
    const raw: RawConfig = JSON.parse(result.output);
    const cfg = defaults();
    if (raw.names) {
      for (const [phase, name] of Object.entries(raw.names)) {
        if (typeof name === 'string' && PHASE_ORDER.includes(phase as PipelinePhase)) {
          cfg.names[phase as PipelinePhase] = name;
        }
      }
    }
    if (raw.models) {
      for (const [phase, model] of Object.entries(raw.models)) {
        if (typeof model === 'string' && PHASE_ORDER.includes(phase as PipelinePhase)) {
          cfg.models[phase as PipelinePhase] = model;
        }
      }
    }
    if (Array.isArray(raw.hidden)) {
      for (const phase of raw.hidden) {
        if (PHASE_ORDER.includes(phase)) cfg.hidden.add(phase);
      }
    }
    cache.set(projectPath, cfg);
    return cfg;
  } catch (err) {
    console.error('[cortx] Failed to load pipeline config:', err);
    const cfg = defaults();
    cache.set(projectPath, cfg);
    return cfg;
  }
}

/** Clear cache (useful after user edits the config). */
export function invalidatePipelineConfig(projectPath?: string) {
  if (projectPath) cache.delete(projectPath);
  else cache.clear();
}

/**
 * Resolve the config for a given task by looking up its project.
 * Returns defaults if task has no project or project has no localPath.
 */
export async function getTaskPipelineConfig(taskId: string): Promise<PipelineConfig> {
  const task = useTaskStore.getState().tasks.find((t) => t.id === taskId);
  if (!task?.projectId) return defaults();
  const project = useProjectStore.getState().projects.find((p) => p.id === task.projectId);
  if (!project?.localPath) return defaults();
  return loadPipelineConfig(project.localPath);
}
