async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

export async function readPipelineConfig(projectPath: string): Promise<{ success: boolean; output: string }> {
  return invoke<{ success: boolean; output: string }>('run_shell_command', {
    cwd: projectPath,
    command: 'cat .cortx/pipeline.json 2>/dev/null',
  });
}

export async function writePipelineConfig(
  projectPath: string,
  content: string,
): Promise<{ success: boolean; error: string }> {
  // Ensure .cortx dir exists + write via base64 to avoid escape issues
  const b64 = btoa(unescape(encodeURIComponent(content)));
  return invoke<{ success: boolean; error: string }>('run_shell_command', {
    cwd: projectPath,
    command: `mkdir -p .cortx && echo '${b64}' | base64 -d > .cortx/pipeline.json`,
  });
}
