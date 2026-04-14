import type { TaskLayer } from '../../types/task';

export interface LayerOption {
  value: TaskLayer;
  label: string;
  desc: string;
  color: string;
}

export const LAYERS: LayerOption[] = [
  { value: 'focus', label: '🎯 Focus', desc: '30min+ deep work', color: '#818cf8' },
  { value: 'batch', label: '📦 Batch', desc: 'Group similar tasks', color: '#eab308' },
  { value: 'reactive', label: '⚡ Reactive', desc: 'Quick (<2min) tasks', color: '#34d399' },
];

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}
