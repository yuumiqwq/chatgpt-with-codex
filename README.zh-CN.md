# Engineering Bridge

这个 fork 通过 MCP 让 ChatGPT 操作本地 Codex 或 DSH。1.7 版为持续工作复用原生任务历史，一次性执行使用不保存原生历史的临时模式；启用主机工具时共有 24 个接口，未启用时为 14 个。

## 与原仓库相比

本 fork 基于 [wudy29/engineering-bridge](https://github.com/wudy29/engineering-bridge)，以下对照以分叉基线 v1.4.2 的提交 [`ddabd94`](https://github.com/wudy29/engineering-bridge/commit/ddabd9486c6a997fc73326267487c31ee4788095) 为准，不代表上游此后的最新状态。

| 方面 | 原仓库的分叉基线 | 本 fork 当前实现 |
| --- | --- | --- |
| 工作延续 | 原生上下文支持监督式继续，Bridge 的监督状态可在重启后丢失 | 保存工作编号、摘要和原生 UUID；统一创建、重新打开与接管，重启后可继续同一份历史 |
| 文件修改 | 执行器只读生成提案，通过独立补丁接口及 APPLY/COMMIT 确认写入和提交 | Codex 默认直接修改文件、操作 Git 和联网；保留显式只读选项，移除旧补丁支线 |
| 一次性执行 | 通过任务或补丁接口发起执行 | 通用 run_temp 使用原生临时模式，不保存可继续的 Codex 对话 |
| 项目与历史查找 | 主要依赖已登记的工作区编号 | 按项目查找工作区和本地 Codex 历史，可接管已有任务 |
| 完成与留存 | 以监督、审阅和接受结果的流程管理每轮执行 | 区分执行结束和目标完成；提供工作摘要、归档及可配置的保留期限 |
| 主机操作 | 以已登记项目中的任务和补丁为主要入口 | 可额外启用文件与命令工具，以及工作区配置重载；这些能力由本机配置决定 |

迁移时需要更新调用方式：本 fork 累计移除了十个旧公开接口。完整列表、兼容性变化和验证范围见 [Fork 改动说明](docs/FORK_CHANGES.md)。

## 使用方式

先用 list_workspaces 或 list_codex_projects 按项目查找，再通过 list_work 找到已有工作。open_work 统一创建、重新打开或接管原生 Codex UUID；continue_work 复用历史并直接修改项目，run_temp 执行通用的一次性指令。

wait_task 每次最多等待 45 秒，ready 为 false 时继续调用；取消等待不会停止执行。finish_work 保存调用方判断的目标完成状态，manage_work 与 work_retention 管理归档及保留期限。默认保存最近 100 份终态执行结果，不自动按天删除历史。

Codex 默认使用 danger-full-access，可以按当前系统账户权限修改文件、联网和完成 Git 提交推送。需要明确限制为分析时可选 read-only，DSH 始终只读。公开接口已移除 workspace-write，也没有独立的受控补丁支线、结果接受步骤或固定确认文字。

## 本机运行

准备 Node.js 22 或更高版本、Git 和选定的执行器 CLI，并完成执行器登录。运行 npm ci 与 npm run build，然后以 node dist/src/mcp-stdio.js 加上工作区配置的绝对路径启动；配置格式参见 config/workspaces.example.json，主机工具读取相邻的 .host-policy.json。个人配置与凭据放在源码仓库之外。

安装新版构建后重启 Bridge，并在 ChatGPT 插件管理中刷新工具资料，再打开新对话。推送 GitHub 不会自动部署本机服务，也不会修改 ChatGPT 连接的总简介。

详细接口见 [工具清单](docs/tools.md)，状态与保留机制见 [工作管理](docs/work-management.md)，运行权限见 [安全说明](SECURITY.md)。[英文说明](README.en.md)提供相同的安装入口，旧版说明保存在 Git 历史中；当前 Windows 测试仍有已知平台相关失败，具体结果以每次发布验证记录为准。

本项目基于 [wudy29/engineering-bridge](https://github.com/wudy29/engineering-bridge) 修改。
