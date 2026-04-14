# Generated TS Types

Rust 구조체에서 ts-rs로 자동 생성된 TypeScript 타입. **수동 편집 금지**.

## 재생성

```bash
cd src-tauri && cargo test --lib
```

`cargo test` 실행 시 `#[derive(TS)]`가 붙은 구조체들이 이 디렉토리로 export된다.

## Rust 측 정의

```rust
#[derive(Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct Foo {
    pub bar: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub baz: Option<String>,
    #[ts(type = "number")]  // u64를 bigint 대신 number로
    pub count: u64,
}
```

## 현재 타입 (12개)

| 타입 | 출처 (Rust) |
|------|-----------|
| `CommandResult` | `types.rs` |
| `OAuthCallbackResult` | `types.rs` |
| `LinkPreview` | `commands/shell.rs` |
| `CortxConfig` | `commands/shell.rs` |
| `SlashCommand` | `commands/claude/mod.rs` |
| `McpServerInfo` | `commands/mcp/mod.rs` |
| `McpServerInput` | `commands/mcp/mutate.rs` |
| `ProjectMetadata` | `commands/scan/mod.rs` |
| `DocEntry` | `commands/scan/grader.rs` |
| `DocGrade` | `commands/scan/grader.rs` |
| `SotStatus` | `commands/scan/mod.rs` |
| `ProjectQuality` | `commands/scan/mod.rs` |

## 사용

```ts
import type { ProjectMetadata } from './types/generated/ProjectMetadata';
// 또는 re-export를 통해:
import type { ProjectMetadata } from './types/project';
```

## 제약

- **u64 → number**: JS Number는 53bit — u64 정확도 손실 가능. 큰 정수는 `#[ts(type = "string")]`로 명시.
- **Option<T> → T | null**: `#[ts(optional)]`을 함께 쓰면 `T?: ...` (union) 대신 `T?: T` (optional) 생성.
- **HashMap<K, V> → { [k in K]?: V }**: Partial 형태. `stringifyEnv` 등에서 undefined 처리 필요.
