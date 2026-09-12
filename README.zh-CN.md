# Engineering Bridge

这个 fork 通过 MCP 让 ChatGPT 操作本地 Codex 或 DSH。1.7 版为持续工作复用 Codex 原生任务历史，一次性执行可选 Codex 临时模式或 DSH headless；启用主机工具时共有 24 个接口，未启用时为 14 个。

## 与原仓库相比

本 fork 基于 [wudy29/engineering-bridge](https://github.com/wudy29/engineering-bridge)，以下对照以分叉基线 v1.4.2 的提交 [`ddabd94`](https://github.com/wudy29/engineering-bridge/commit/ddabd9486c6a997fc73326267487c31ee4788095) 为准，不代表上游此后的最新状态。

| 方面 | 原仓库的分叉基线 | 本 fork 当前实现 |
| --- | --- | --- |
| 工作延续 | 原生上下文支持监督式继续，Bridge 的监督状态可在重启后丢失 | 保存工作编号、摘要和原生 UUID；统一创建、重新打开与接管，重启后可继续同一份历史 |
| 文件修改 | 通过独立的提案和应用流程修改项目 | Codex 与 DSH 均使用每次执行的 access 直接工作，默认完全访问 |
| 一次性执行 | 通过任务或补丁接口发起执行 | 通用 run_temp 可选 Codex 或 DSH；Codex 使用原生临时模式，DSH 使用一次性 headless 执行 |
| 项目与历史查找 | 主要依赖已登记的工作区编号 | 按项目查找工作区和本地 Codex 历史，可接管已有任务 |
| 完成与留存 | 以监督、审阅和接受结果的流程管理每轮执行 | 区分执行结束和目标完成；提供工作摘要、归档及可配置的保留期限 |
| 主机操作 | 以已登记项目中的任务和补丁为主要入口 | 可额外启用文件与命令工具，以及工作区配置重载；这些能力由本机配置决定 |

迁移时需要更新调用方式：本 fork 累计移除了十个旧公开接口。完整列表、兼容性变化和验证范围见 [Fork 改动说明](docs/FORK_CHANGES.md)。

## 使用方式

先用 list_workspaces 或 list_codex_projects 按项目查找，再通过 list_work 找到已有工作。open_work 统一创建、重新打开或接管原生 Codex UUID；continue_work 复用历史并直接修改项目，run_temp 执行通用的一次性指令。

wait_task 每次最多等待 45 秒，ready 为 false 时继续调用；取消等待不会停止执行。finish_work 保存调用方判断的目标完成状态，manage_work 与 work_retention 管理归档及保留期限。默认保存最近 100 份终态执行结果，不自动按天删除历史。

Codex 与 DSH 均支持 read-only 和 danger-full-access；run_temp 对两者都默认使用 danger-full-access，并按每次调用的 access 选择权限。完全访问允许执行器按当前系统账户权限修改文件及执行命令；Codex 通过原生沙箱配置接收权限，DSH 通过每次进程的 DSH_PERMISSION_MODE 接收权限，具体限制见[安全说明](SECURITY.md)。

workspace 只保存项目编号、名称、根目录和来源，并以 project_root 限制可登记项目。执行器写权限由 open_work、continue_work 和 run_temp 的 access 决定；Bridge 自身的文件与命令工具由独立的 host policy 控制。DSH 继续使用一次性 headless 接口，不返回可续接的 Codex UUID，也不接受 Codex 专用的 model 和 reasoning_effort。

Windows 下，Bridge 直接启动的 Git、DSH、Codex 和主机命令进程均设置为隐藏控制台窗口，输出仍通过工具结果返回；执行器内部主动打开的窗口不在此保证范围内。

## 本机运行

准备 Node.js 22 或更高版本、Git 和选定的执行器 CLI，并完成执行器登录。运行 npm ci 与 npm run build，然后以 node dist/src/mcp-stdio.js 加上工作区配置的绝对路径启动；配置格式参见 config/workspaces.example.json，主机工具读取相邻的 .host-policy.json。个人配置与凭据放在源码仓库之外。

安装新版构建后重启 Bridge，并在 ChatGPT 插件管理中刷新工具资料，再打开新对话。推送 GitHub 不会自动部署本机服务，也不会修改 ChatGPT 连接的总简介。

详细接口见 [工具清单](docs/tools.md)，状态与保留机制见 [工作管理](docs/work-management.md)，运行权限见 [安全说明](SECURITY.md)。[英文说明](README.en.md)提供相同的安装入口，旧版说明保存在 Git 历史中；当前 Windows 测试仍有已知平台相关失败，具体结果以每次发布验证记录为准。

本项目基于 [wudy29/engineering-bridge](https://github.com/wudy29/engineering-bridge) 修改。
