/** English translations — source of truth for all keys. */
export const en = {
  // Common
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.close': 'Close',
  'common.retry': 'Retry',
  'common.confirm': 'Confirm',
  'common.loading': 'Loading...',
  'common.saving': 'Saving...',
  'common.deleting': 'Deleting...',
  'common.saved': 'Saved',
  'common.unsaved': 'Unsaved changes',

  // Tabs
  'tab.claude': 'Claude',
  'tab.terminal': 'Terminal',
  'tab.contextPack': 'Context Pack',

  // Right panel tabs
  'rp.dashboard': 'Dashboard',
  'rp.worktree': 'Worktree',
  'rp.context': 'Context',
  'rp.history': 'History',
  'rp.projects': 'Projects',
  'rp.changes': 'Changes',

  // Task statuses
  'task.status.waiting': 'Waiting',
  'task.status.active': 'In Progress',
  'task.status.paused': 'Paused',
  'task.status.done': 'Done',

  // Actions
  'action.start': 'Start',
  'action.pause': 'Pause',
  'action.resume': 'Resume',
  'action.done': 'Done',
  'action.newTask': 'New Task',
  'action.newProject': 'New Project',
  'action.openSettings': 'Open Settings',
  'action.dailyReport': 'Daily Report',
  'action.toggleSidebar': 'Toggle Sidebar',
  'action.toggleRightPanel': 'Toggle Right Panel',
  'action.runPipeline': 'Run Pipeline',
  'action.stopClaude': 'Stop Claude Process',
  'action.markDone': 'Mark as Done',
  'action.worktreeCleanup': 'Worktree Cleanup',
  'action.manageMcp': 'Manage MCP Servers',
  'action.slashBuilder': 'Slash Command Builder',
  'action.checkUpdates': 'Check for Updates',
  'action.editPipelineConfig': 'Edit Pipeline Config',
  'action.exportMd': 'Export Current Task (Markdown)',
  'action.exportJson': 'Export Current Task (JSON)',
  'action.importJson': 'Import Tasks from JSON',

  // Empty states
  'empty.noActiveTask': 'No active task',
  'empty.noActiveTask.sub': 'Select or create a task to get started',
  'empty.claudeCode': 'Claude Code',
  'empty.claudeCode.sub1': 'Uses your Claude CLI authentication.',
  'empty.claudeCode.sub2': 'No API key or credits needed.',
  'empty.noPipeline': 'No pipeline active',
  'empty.noRepo': 'No repository',
  'empty.noChanges': 'No changes',

  // Chat
  'chat.thinking': 'Claude is thinking...',
  'chat.placeholder': 'Send a message or type / for commands...',
  'chat.you': 'You',
  'chat.claudeCode': 'Claude Code',

  // Status bar
  'status.sidebar': 'sidebar',
  'status.panel': 'panel',
  'status.palette': 'palette',
  'status.pause': 'pause',
  'status.resume': 'resume',

  // Today summary
  'today.title': 'TODAY',
  'today.report': 'Report',
  'today.focus': 'Focus',
  'today.interrupts': 'Interrupts',
  'today.done': 'Done',

  // Settings
  'settings.title': 'Settings',
  'settings.aiProvider': 'AI Provider',
  'settings.contextSources': 'Context Sources',
  'settings.appearance': 'Appearance',
  'settings.theme': 'Theme',
  'settings.language': 'Language',
  'settings.theme.dark': 'Dark',
  'settings.theme.midnight': 'Midnight',
  'settings.theme.light': 'Light',
  'settings.theme.dark.desc': 'Classic Cortx teal — the default',
  'settings.theme.midnight.desc': 'Deep black with purple accents',
  'settings.theme.light.desc': 'Daytime-friendly bright theme',

  // Command Palette
  'palette.search': 'Search tasks, projects, actions...',
  'palette.noResults': 'No results found.',
  'palette.actions': 'Actions',
  'palette.tasks': 'Tasks',
  'palette.projects': 'Projects',
  'palette.chatMessages': 'Chat Messages',
  'palette.currentTask': 'Current Task',

  // Pipeline
  'pipeline.grill_me': 'Grill-me',
  'pipeline.obsidian_save': 'Save',
  'pipeline.dev_plan': 'Dev Plan',
  'pipeline.implement': 'Implement',
  'pipeline.commit_pr': 'PR',
  'pipeline.review_loop': 'Review',
  'pipeline.done': 'Done',

  // New Task Modal
  'newTask.title': 'New Task',
  'newTask.taskTitle': 'Task title',
  'newTask.project': 'Project',
  'newTask.layer': 'Layer',
  'newTask.branchName': 'Branch name',
  'newTask.create': 'Create Task',
  'newTask.creating': 'Creating...',
  'newTask.noProject': 'No project',

  // New Project Modal
  'newProject.title': 'New Project',
  'newProject.openExisting': 'Open project',
  'newProject.openExistingDesc': 'Select an existing local folder',
  'newProject.cloneFromUrl': 'Clone from URL',
  'newProject.cloneFromUrlDesc': 'Clone a Git repository',

  // Reset Session
  'reset.title': 'Reset Session',
  'reset.warning': 'This will clear all messages, session, pipeline state, and discard uncommitted changes. This cannot be undone.',
  'reset.confirm': 'Reset Session',

  // Crash Recovery
  'crash.title': 'Interrupted Pipelines Detected',
  'crash.description': 'These tasks were running when the app was last closed abnormally.',
  'crash.resume': 'Resume',
  'crash.cancel': 'Cancel',
  'crash.dismissAll': 'Dismiss All',

  // Confirmation
  'confirm.deleteTask': 'Delete this task?',
  'confirm.deleteProject': 'Delete this project?',
  'confirm.unsaved': 'You have unsaved changes. Continue?',
} as const;
