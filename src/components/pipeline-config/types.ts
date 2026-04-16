export interface PipelineConfigEditorProps {
  projectPath: string;
  projectName: string;
  onClose: () => void;
}

export const TEMPLATE = `{
  "names": {
    "grill_me": "Grill-me",
    "save": "Save",
    "dev_plan": "Dev Plan",
    "implement": "Implement",
    "commit_pr": "PR",
    "review_loop": "Review",
    "done": "Done"
  },
  "models": {
    "grill_me": "Opus",
    "save": "Opus",
    "dev_plan": "Opus",
    "implement": "Sonnet",
    "commit_pr": "Sonnet",
    "review_loop": "Opus"
  },
  "hidden": []
}
`;

export function validateJson(text: string): string | null {
  try {
    JSON.parse(text);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
