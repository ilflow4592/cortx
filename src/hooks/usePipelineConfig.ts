/**
 * React hook to load pipeline config for a task's project.
 * Returns null while loading, then the resolved config.
 * Safe to use during loading — fall back to defaults from constants.
 */
import { useEffect, useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { loadPipelineConfig, type PipelineConfig } from '../services/pipelineConfig';
import { PHASE_NAMES, PHASE_MODELS } from '../constants/pipeline';

function defaults(): PipelineConfig {
  return {
    names: { ...PHASE_NAMES },
    models: { ...PHASE_MODELS },
    hidden: new Set(),
  };
}

export function usePipelineConfig(taskId: string | null | undefined): PipelineConfig {
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === taskId));
  const project = useProjectStore((s) =>
    task?.projectId ? s.projects.find((p) => p.id === task.projectId) : null,
  );
  const projectPath = project?.localPath || '';
  const [config, setConfig] = useState<PipelineConfig>(() => defaults());

  useEffect(() => {
    let cancelled = false;
    if (!projectPath) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when project clears
      setConfig(defaults());
      return;
    }
    loadPipelineConfig(projectPath)
      .then((cfg) => {
        if (!cancelled) setConfig(cfg);
      })
      .catch(() => {
        if (!cancelled) setConfig(defaults());
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  return config;
}
