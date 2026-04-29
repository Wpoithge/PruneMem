# Audit Findings — 2026-04-26

> Note: curate.js / normalize-legacy-runs.js placeholders were deleted in T3 (Step 3 closeout). Original audit records below are preserved as historical archive.

## Task 1: Core inventory

| 文件 | 类型 | 备注 |
|---|---|---|
| `archive-session-v41.js` | CLI-only | 32 行，有 main() + catch，import runtime/archive-session.js |
| `build-runtime-context.js` | CLI-only | 44 行，有 main()，无 export |
| `check-provider-config.js` | CLI-only | 27 行，有 main() + catch，无 export |
| `curate.js` | placeholder | 2 行，只输出 placeholder JSON |
| `curator-apply.js` | CLI-only | 279 行，无 main() 但有顶层执行逻辑，无 export |
| `execution-plan.js` | CLI-only | 25 行，有 main() + catch，无 export |
| `get-working-state.js` | CLI-only | 20 行，有 main() + catch，无 export |
| `maintain.js` | CLI-only | 81 行，有 main()，用 spawn() 调用其他 core 脚本 |
| `normalize-legacy-runs.js` | placeholder | 2 行，只输出 placeholder JSON |
| `repair-source-paths.js` | CLI-only | 47 行，有 main()，无 export |
| `run-extract.js` | CLI-only | 57 行，有 main()，无 export |
| `run-judge.js` | CLI-only | 66 行，有 main()，无 export |
| `run-sample-pipeline.js` | CLI-only | 49 行，有 main()，用 spawn() 调用其他 core 脚本 |
| `update-registries.js` | CLI-only | 169 行，无 main() 但有顶层执行逻辑，无 export |
| `update-working-state.js` | CLI-only | 60 行，有 main() + catch，无 export |
| `validate-maintenance.js` | CLI-only | 214 行，有 main()，无 export |

**结论：**
- 16 个文件中，2 个是 placeholder（curate / normalize-legacy-runs）
- 14 个真实脚本全部是 **CLI-only**，无一例外没有 export
- 其中 2 个（curator-apply / update-registries）没有显式 main() 函数，而是顶层直接执行
- maintain.js 和 run-sample-pipeline.js 用 spawn() 调用其他 core 脚本

## Task 2: archive-session pair

**对比结果：**
- `src/runtime/archive-session.js`：**纯库形态**，export async function archiveSession()，17 行 export 函数定义
- `src/core/archive-session-v41.js`：**CLI 包装器**，32 行，import { archiveSession } from '../runtime/archive-session.js'，然后在 main() 里调用

**结论：**
这是一对 **已经实现的 lib+CLI 双模式**。runtime 版本是库，core 版本是 CLI 入口。

**Plan 影响：**
Step 1 的 pilot 可以从 archive-session-v41 起手——它已经展示了正确的模式，只需要验证这个模式在其他脚本上的可复制性。但注意：archive-session-v41 是**最简单**的（只有 32 行），curator-apply（279 行）复杂度高得多。

## Task 3: lib/paths.js status

**当前状态：**
```javascript
export function defaultPaths() {
  return {
    registryDir: './examples/registry',
    pipelineDir: './examples/pipeline',
    layersDir: './examples/layers',
  };
}
```

**grep 结果：**
- `grep -rn "from.*lib/paths" src/core/`：**0 个结果**，core 脚本完全不用 lib/paths
- `grep -rn "path.join.*examples" src/core/`：**25 个匹配**，所有 core 脚本都硬编码 `path.join(root, 'examples', ...)`

**结论：**
lib/paths.js 存在但**完全未被使用**。它只是把硬编码字符串集中到一处，没有实现 layout preset 机制（不支持不同的 path 集）。

**Plan 影响：**
Step 4（路径抽象化）工作量是 **100%**，需要：
1. 扩展 lib/paths.js 支持 layout preset（例如 `getPaths(preset)` 返回不同的路径集）
2. 把 core 脚本里 25 处硬编码改成调用 lib/paths
3. 这是一个独立的、可以在 Step 1-3 之后单独做的任务

## Task 4: retrieve-memory consumer analysis

**代码分析：**
- `src/runtime/retrieve-memory.js`：只有 4 行，export async function retrieveMemory(query, { backend })
- grep 结果：**0 个调用方**，在 src/core / lib / runtime / working / extract / judge / archive 里完全没被用到

**结论：**
retrieveMemory 是一个**未使用的存根函数**。它不是 host-facing API，也不是内部使用的。

**Plan 影响：**
CLAUDE.md 里"PruneMem 不做 retrieval"的说法是**对的**。这个函数可能是早期预留的接口，但当前版本没有实现检索功能。contracts.md 不需要修正。

## Task 5: existing adapter mechanism

**当前机制：**
`src/adapters/index.js` 定义了：
- `RetrievalBackend` 基类（search / getByMemoryId / listByTopic / listByDedupe）
- `ModelProvider` 基类（extractFacts / judgeFacts）
- `ProviderError` 错误类
- 工具函数：getApiKeyFromEnv / ensureProviderConfig

**实现：**
- Backend: `file-backend.js` / `qmd-backend.js`（都继承 RetrievalBackend）
- Provider: `openai-compatible-provider.js` / `bailian-provider.js`（都继承 ModelProvider）

**选择机制：**
没有统一的 factory 或 registry。每个消费方（如 src/runtime/provider-factory.js）自己 import 并实例化。

**结论：**
现有机制是**基于继承的接口约定**，不是 plugin registry。可以复用这个模式给 host adapter（在 src/hosts/ 里定义基类 HostAdapter，各宿主继承它）。

**Plan 影响：**
Step 3（host 集成）可以复用 adapters/ 的模式，但 host adapter 应该放在 **src/hosts/** 而非 src/adapters/（adapters 已经被 backend/provider 占用）。

## Task 6: hard rule self-check

**grep 结果：**
```bash
grep -rni "openclaw\|hermes" src/core/ src/lib/ src/runtime/ \
  src/working/ src/extract/ src/judge/ src/archive/
```
**输出：空**

```bash
grep -rni "vector\|embedding" src/core/ src/lib/ src/runtime/ \
  src/working/ src/extract/ src/judge/ src/archive/
```
**输出：空**

**结论：**
✅ 中立层完全干净，无宿主名字、无 vector/embedding 耦合。

**注意：**
`qmd` 在 src/adapters/qmd-backend.js 里出现是合法的（adapters 不在 hard rule 检查范围内）。

## Task 7: CLI baseline snapshots

**执行结果：**
- 16 个脚本全部测试完成
- 11 个成功生成 golden JSON（包括 2 个 placeholder）
- 3 个因缺少 API key 失败（run-extract / run-judge / run-sample-pipeline）

**详细：**
| 脚本 | 状态 | 备注 |
|---|---|---|
| curate | ✅ OK | placeholder |
| normalize-legacy-runs | ✅ OK | placeholder |
| archive-session-v41 | ✅ OK | 需要 --workspace . |
| build-runtime-context | ✅ OK | |
| check-provider-config | ✅ OK | |
| curator-apply | ✅ OK | |
| execution-plan | ✅ OK | |
| get-working-state | ✅ OK | |
| maintain | ✅ OK | |
| repair-source-paths | ✅ OK | |
| update-registries | ✅ OK | |
| update-working-state | ✅ OK | |
| validate-maintenance | ✅ OK | |
| run-extract | ❌ FAIL | PROVIDER_AUTH_MISSING: PRUNEMEM_API_KEY |
| run-judge | ❌ FAIL | PROVIDER_AUTH_MISSING: PRUNEMEM_API_KEY |
| run-sample-pipeline | ❌ FAIL | 依赖 run-extract，同样缺 API key |

**结论：**
11 个脚本的 golden baseline 已生成在 `tests/golden/*.json`。3 个需要 LLM 调用的脚本在改造时需要用 --mock 模式测试（run-sample-pipeline 已经支持 --mock）。

## Task 8: testing infra

**现状：**
- ✅ `tests/` 目录已存在
- ✅ 有 `tests/regression/` 目录，包含 10 个回归测试脚本（check-*.js）
- ✅ 有 `tests/fixtures/` 和 `tests/integration/` 目录（目前只有 README）
- ✅ `package.json` 有 `scripts.check`，运行 `scripts/run-checks.sh`
- ❌ 测试脚本**不使用 node:test**，而是自己写 spawn + assert 逻辑
- ✅ 新建了 `tests/golden/` 目录，存放 CLI baseline snapshots

**package.json scripts：**
```json
"scripts": {
  "check": "node scripts/run-checks.sh",
  "demo": "bash scripts/demo.sh"
}
```

**结论：**
测试基础设施已存在，但不符合 test-strategy.md 的要求（应该用 node:test）。

**Plan 影响：**
Step 1 改造时，应该：
1. 保留现有 `tests/regression/` 的回归测试（它们测试的是端到端行为）
2. 新增 `tests/unit/` 目录，用 node:test 写单元测试
3. 在 package.json 加 `"test": "node --test tests/unit/**/*.test.js"`

## Plan impact summary

**需要调整的地方：**

1. **Step 1 pilot 选择：**
   - ✅ 可以从 archive-session-v41 起手（已有 lib+CLI 双模式参考）
   - ⚠️ 但 archive-session-v41 太简单（32 行），建议 pilot 选 **curator-apply**（279 行，更有代表性）
   - 或者两步走：先验证 archive-session-v41 模式可行，再用 curator-apply 验证复杂场景

2. **Step 4（路径抽象化）工作量：**
   - 从"部分完成"改为 **"0% 完成"**
   - lib/paths.js 存在但未被使用，需要完整实现 layout preset 机制 + 改 25 处硬编码

3. **Step 3（host 集成）目录：**
   - 确认使用 **src/hosts/** 而非 src/adapters/（后者已被 backend/provider 占用）
   - 可以复用 adapters/ 的基类继承模式

4. **测试策略：**
   - 保留现有 tests/regression/（端到端测试）
   - 新增 tests/unit/（用 node:test 写单元测试）
   - package.json 加 `"test": "node --test tests/unit/**/*.test.js"`

5. **curator-apply / update-registries 特殊处理：**
   - 这两个脚本没有 main() 函数，是顶层直接执行
   - 改造时需要先包装成 main() 函数，再抽 export

6. **maintain.js / run-sample-pipeline.js 的 spawn() 调用：**
   - 这两个脚本用 spawn() 调用其他 core 脚本
   - 改造后应该改成 `import { foo } from './foo.js'` 直接调用
   - 这是 Step 2 的重点任务

## Open questions

1. **curator-apply / update-registries 的顶层执行逻辑：**
   - 这两个脚本没有 main() 函数，代码直接在顶层执行
   - 改造时是否需要先重构成 main() 函数？还是直接把顶层逻辑包装成 export 函数？
   - 建议：先包装成 main()，再按标准模式改造（保持一致性）

2. **run-extract / run-judge / run-sample-pipeline 的测试：**
   - 这 3 个脚本需要 LLM API key
   - run-sample-pipeline 已经支持 --mock 模式
   - run-extract / run-judge 是否也需要加 --mock 模式？还是只在 CI 里跳过它们？
   - 建议：在 Step 1 改造时顺便加 --mock 支持

3. **lib/paths.js 的 preset 设计：**
   - Step 4 需要实现 layout preset 机制
   - preset 应该支持哪些场景？
     - 默认 preset：examples/（当前硬编码）
     - 自定义 preset：用户指定任意目录结构
     - 宿主 preset：openclaw / hermes 各自的 layout
   - 建议：先支持默认 + 自定义，宿主 preset 在 Step 3 时再加

4. **tests/golden/ 的 commit 策略：**
   - 这些 golden JSON 是回归基准，应该 commit 吗？
   - 还是只在本地用，CI 里重新生成？
   - 建议：commit 到 repo，作为 backward compatibility 的证据
