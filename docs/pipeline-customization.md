# Pipeline Customization

Projects can override pipeline phase display names and model assignments by
creating a `.cortx/pipeline.json` file in the project root.

## File: `<project-root>/.cortx/pipeline.json`

```json
{
  "names": {
    "grill_me": "Requirements",
    "obsidian_save": "Save",
    "dev_plan": "Design",
    "implement": "Implement",
    "commit_pr": "Review & PR",
    "review_loop": "Review Loop",
    "done": "Done"
  },
  "models": {
    "grill_me": "Opus",
    "dev_plan": "Opus",
    "implement": "Sonnet",
    "commit_pr": "Sonnet",
    "review_loop": "Opus"
  },
  "hidden": ["obsidian_save"]
}
```

## Fields (all optional)

| Field | Type | Description |
|-------|------|-------------|
| `names` | `Record<Phase, string>` | Override the display name for specific phases. Unset phases use defaults. |
| `models` | `Record<Phase, string>` | Override the model badge shown next to each phase (informational only; actual model selection is handled by pipeline skills). |
| `hidden` | `Phase[]` | Hide specific phases from the dashboard stepper and table. Useful if your project skips a phase entirely (e.g., no Obsidian sync). |

## Phase identifiers

These are the internal phase names that pipeline skills emit via
`[PIPELINE:phase:status]` markers. They cannot be renamed at the skill level,
only displayed differently:

- `grill_me`
- `obsidian_save`
- `dev_plan`
- `implement`
- `commit_pr`
- `review_loop`
- `done`

## Behavior

- Reloaded automatically when switching tasks between projects.
- Cached in memory per project path — restart the app (or invalidate the cache)
  after editing.
- Falls back to the built-in defaults if:
  - The file doesn't exist
  - The JSON is malformed
  - A phase key is unknown

## Example: minimal override

```json
{
  "names": {
    "grill_me": "요구사항 분석",
    "implement": "구현"
  }
}
```

## Example: Backend project that skips Obsidian sync

```json
{
  "hidden": ["obsidian_save"]
}
```

## Example: Research project using Opus everywhere

```json
{
  "models": {
    "implement": "Opus"
  }
}
```
