# GSD + Codex 协作 PR 教程（中文版）

[English version](./gsd-codex-pr-workflow.md)

这篇教程讲的是一套实用工作流：用 **GSD** 负责规划、状态、验证、分支和 PR 流程，用 **Codex** 负责方案审查、难点调试、严格 review 和 PR 文案整理，最终产出一个聚焦、可审查、能自证的 PR。

## 为什么要一起用

两者最好分工明确：

- **GSD** 负责范围控制、任务拆解、状态持久化、验证命令、分支策略和 PR 流程。
- **Codex** 负责实现难点、根因分析、对抗式 review、以及最终 PR 说明整理。

这样做的好处是：

- GSD 把工作沉淀在 `.gsd/` 里，不容易跑偏。
- Codex 提供第二视角，避免“作者自己给自己打高分”。

## 核心规则

如果你想要的是一个好 PR，而不是一坨 AI diff，先守住这几条：

1. **同一时间只能有一个 writer。** 不要让 GSD 和 Codex 同时改同一批文件。
2. **是否完成由机械校验决定。** `build`、`typecheck`、`lint`、`test` 比模型“感觉没问题”更重要。
3. **PR 必须聚焦。** 一个 PR 只解决一个主题。
4. **Codex 要当 reviewer，不只是 generator。**
5. **你自己必须能解释最终 diff。**

## 两种组合方式

### 推荐方式：GSD 主导，Codex 辅助审查

大多数场景都建议这样用：

- GSD 负责拆解、执行、校验、推进分支。
- Codex 负责读计划、挑问题、帮你解难 bug、做严格 pre-PR review。

这是最稳的方式，因为 `.gsd/` 状态始终可信，也最不容易出现两边上下文不一致。

### 进阶方式：Codex 直接改 GSD 当前分支

这个方式可以用，但要求你手动控场：

- 先暂停 GSD，再让 Codex 动手。
- 优先使用 `git.isolation: branch`，这样 GSD 和 Codex 都在仓库根目录工作。
- 如果你使用 `git.isolation: worktree`，那 Codex 必须进入当前活跃的 `.gsd/worktrees/<MID>/` 目录里工作，不能还停留在主仓库根目录。

否则很容易出现：GSD 在 A 工作树里规划，Codex 在 B 工作树里改代码。

## 前置准备

在目标仓库里执行：

```bash
npm install -g gsd-pi
gh auth login
```

其中 `gh auth login` 不是必须，但如果你准备 `gh pr create`，最好先配好。

然后启动 GSD：

```bash
gsd
```

进入 GSD 后：

```text
/login
/model
```

说明：

- GSD 支持很多模型提供方。
- 如果你有 **Codex** 订阅，GSD 也可以直接通过 OAuth 使用它。
- 这篇教程默认你是把 **Codex 当成独立工具** 使用，而让 **GSD 充当工作流引擎**。

## 推荐的项目配置

在目标仓库里创建或更新 `.gsd/PREFERENCES.md`：

```yaml
---
version: 1
mode: team
token_profile: quality

git:
  isolation: branch
  push_branches: true
  auto_push: false
  auto_pr: false
  pre_merge_check: true

verification_commands:
  - npm run build
  - npm run typecheck
  - npm run lint
  - npm run test
verification_auto_fix: true
verification_max_retries: 2

post_unit_hooks:
  - name: code-review
    after: [execute-task]
    prompt: "Review the latest task for correctness, regressions, missing tests, API breakage, and security issues. If blockers remain, write NEEDS-REWORK.md with exact fixes."
    retry_on: NEEDS-REWORK.md
---
```

这套配置的意义：

- `mode: team` 会启用更偏 PR 场景的安全默认值。
- `git.isolation: branch` 比 `worktree` 更方便和 Codex 配合。
- `verification_commands` 把完成条件落到命令上。
- `post_unit_hooks` 会在任务执行后追加一轮 review。

如果你是个人使用，不想把 `.gsd/` 工件提交进仓库，可以看 [working-in-teams.md](./working-in-teams.md)，并考虑设置 `git.commit_docs: false`。

## 推荐工作流

### 1. 先定义 PR，再开始写代码

在目标仓库启动：

```bash
gsd
```

然后根据场景选择：

- 修 bug 型 PR：`/gsd start bugfix`
- 一般功能 / 重构型 PR：`/gsd discuss`

你可以直接给 GSD 下面这种 brief：

```text
我们要准备一个聚焦的 PR。

目标：
- <这个 PR 要交付什么>

非目标：
- <这个 PR 明确不做什么>

背景 / issue：
- <issue 链接、bug 描述或动机>

验收标准：
- <用户可观察结果>

验证命令：
- npm run build
- npm run typecheck
- npm run lint
- npm run test

风险边界：
- <API、迁移、兼容性、文档、数据结构等需要特别小心的点>
```

这一阶段你希望 GSD 产出的是：

- `.gsd/PROJECT.md`
- `.gsd/REQUIREMENTS.md`
- milestone context 和 roadmap
- 少量、明确、可验证的 slices / tasks

### 2. 先让 GSD 做计划，不要一上来就自由发挥

在开始实现前，先拿到明确任务计划：

```text
/gsd
```

或者：

```text
/gsd next
```

推进到当前 task plan 已经成型为止。重点看：

- `.gsd/STATE.md`
- `.gsd/PROJECT.md`
- `.gsd/DECISIONS.md`
- 当前 slice plan
- 当前 task plan

这时让 Codex 做一次**只读计划审查**。

可以直接把下面这段发给 Codex：

```text
先不要改代码。先读当前 GSD 计划并做审查。

请读取：
- .gsd/STATE.md
- .gsd/PROJECT.md
- .gsd/DECISIONS.md
- 当前 slice plan
- 当前 task plan

请检查：
- 是否有 scope creep
- 是否遗漏回归风险
- 是否缺少测试
- 是否有 API / migration 风险
- 是否有更简单的实现路径

只返回具体发现，不要先动手修改。
```

如果 Codex 发现计划本身有问题，先用 `/gsd discuss` 或 `/gsd steer` 修计划，再进入实现阶段。

### 3. 让 GSD 执行，Codex 作为 sidecar

现在可以运行：

```text
/gsd auto
```

或者继续一步一步：

```text
/gsd
```

推荐用法：

- 正常任务交给 GSD 执行。
- 遇到以下情况再叫 Codex 介入：
  - 任务比较难，想要第二设计意见
  - GSD 卡住了或者开始绕圈
  - 验证失败，但原因不明显
  - 你想在推进前做一次更严格的 review

**关键规则：** 当 GSD 正在写文件时，Codex 应保持只读。

如果你想让 Codex 真正补丁：

1. 用 `Escape` 或 `/gsd pause` 暂停 GSD
2. 让 Codex 修改代码
3. 回到 GSD，用 `/gsd auto` 恢复

这样可以保证始终只有一个活跃 writer。

### 4. 把 Codex 用在难调试的问题上

当 GSD 遇到难 bug 或验证失败时，先暂停，再把问题交给 Codex 做根因分析。

你可以这样问 Codex：

```text
请调试这个失败，但不要扩大范围。

请读取：
- 当前 GSD task plan
- 失败命令输出
- 当前分支改过的文件

目标：
- 找到 root cause
- 给出最小且正确的修复方案
- 不要把 PR 范围扩出去

输出：
- 根因
- 修复计划
- 证明修复有效的测试或验证方式
```

拿到可信方案后，你可以选择：

- 用 `/gsd steer` 把方案反馈给 GSD
- 或者在 GSD 暂停时让 Codex 直接补丁，再恢复 GSD

### 5. 在开 PR 前，让 Codex 做一次对抗式 review

不要只相信“作者模式”的输出。开 PR 前，最好让 Codex 站在严格 reviewer 角度再看一遍。

可以直接这样问：

```text
请把这个分支当成待审 PR 来 review。

如果不够扎实，就按 blocker 标准提问题。

重点检查：
- 正确性 bug
- 回归风险
- 是否缺少 regression test
- 公共 API / CLI / 配置兼容性破坏
- 文档或迁移说明缺口
- 安全问题

请读取完整变更文件，不要只看 diff。
按严重程度排序返回 findings，并带文件引用。
如果没有发现，也要明确说 no findings，并列出剩余风险。
```

这一步非常重要。它能显著降低“功能做出来了，但 PR 说不圆、测不实、边界没兜住”的概率。

### 6. 做最终机械验证

即使 GSD 已经跑过，也建议在开 PR 前再手动跑一遍你真正希望 reviewer 信任的命令。

典型 Node / TypeScript 仓库：

```bash
npm run build
npm run typecheck
npm run lint
npm run test
```

如果目标仓库不是这个栈，就换成它自己的真实命令。

对于 bug fix，最好确认：

- 有 regression test
- 没修复前它会失败
- 修复后它会通过

### 7. 用 Codex 或你自己整理 PR 文案

这个仓库自己的贡献规范要求 PR 说明里至少要有 **TL;DR / What / Why / How**。见 [../CONTRIBUTING.md](../CONTRIBUTING.md)。

推荐模板：

```md
## TL;DR

**What:** <一句话描述改了什么>
**Why:** <一句话描述为什么要改>
**How:** <一句话描述怎么改的>

## What

<描述这个 PR 做了哪些变化。聚焦在当前 PR。>

## Why

<描述问题、根因或动机。必要时链接 issue。>

## How

<说明实现路径、关键取舍，以及为什么这样设计。>

## Verification

- npm run build
- npm run typecheck
- npm run lint
- npm run test

## AI-assisted disclosure

This PR was prepared with AI assistance. I reviewed the final diff, ran verification locally, and can explain the changes and tradeoffs.
```

你也可以让 Codex 帮你起草，但要约束它不要编造结果：

```text
请根据这个分支起草 PR 文案。

输入：
- 问题背景或 issue
- 最终 diff
- 实际执行过的验证命令和结果

输出格式：
- TL;DR
- What
- Why
- How
- Verification
- AI-assisted disclosure

不要编造任何没有真实执行过的检查结果。
```

### 8. 开 PR

手动开：

```bash
git push -u origin <branch>
gh pr create
```

自动开：

```yaml
git:
  auto_push: true
  auto_pr: true
  pr_target_branch: main
```

只有当你已经信任自己的校验和 review 流程时，才建议打开 `auto_pr`。

## 一套最稳的日常模式

如果你想记一套简单规则，照这个顺序走就够了：

1. 用 GSD 定义 PR 目标和边界
2. 用 GSD 做计划
3. 用 Codex 做只读计划审查
4. 用 GSD 执行大部分任务
5. 遇到难题时暂停 GSD，再让 Codex 补丁或调试
6. 开 PR 前让 Codex 做严格 review
7. 跑最终命令校验
8. 提交一个你自己讲得清楚的 PR

## 常见反模式

下面这些做法很容易把 PR 搞坏：

- GSD 在 `auto`，Codex 还在同时改同一批文件
- 一上来就让 Codex “把整个仓库都修一遍”
- `build / lint / typecheck / test` 没过就开 PR
- PR 文案是 AI 写的，但你自己解释不出来
- 在 bugfix PR 里顺手塞一堆无关重构
- 用 `worktree` 模式跑 GSD，但 Codex 还在主仓库根目录里工作

## AI 辅助 PR 的完成定义

当下面这些条件都满足时，你再开 PR：

- diff 只围绕一个主题
- 最终实现和 GSD 计划一致
- 验证命令全部通过
- 每个 bug fix 都有回归测试
- Codex 做过严格 review
- PR 文案能清楚说明 **What / Why / How**
- reviewer 问你问题时，你不用再去反问模型
