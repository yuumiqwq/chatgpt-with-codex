# Engineering Bridge

这个 fork 通过 MCP 让 ChatGPT 操作本地 Codex 或 DSH。1.7 版为持续工作复用原生任务历史，一次性执行使用不保存原生历史的临时模式；启用主机工具时共有 24 个接口，未启用时为 14 个。

## 使用方式

先用 list_workspaces 或 list_codex_projects 按项目查找，再通过 list_work 找到已有工作。open_work 统一创建、重新打开或接管原生 Codex UUID；continue_work 复用历史并直接修改项目，run_temp 执行通用的一次性指令。

wait_task 每次最多等待 45 秒，ready 为 false 时继续调用；取消等待不会停止执行。finish_work 保存调用方判断的目标完成状态，manage_work 与 work_retention 管理归档及保留期限。默认保存最近 100 份终态执行结果，不自动按天删除历史。

Codex 默认使用 danger-full-access，可以按当前系统账户权限修改文件、联网和完成 Git 提交推送。需要明确限制为分析时可选 read-only，DSH 始终只读。公开接口已移除 workspace-write，也没有独立的受控补丁支线、结果接受步骤或固定确认文字。

## 本机运行

准备 Node.js 22 或更高版本、Git 和选定的执行器 CLI，并完成执行器登录。运行 npm ci 与 npm run build，然后以 node dist/src/mcp-stdio.js 加上工作区配置的绝对路径启动；配置格式参见 config/workspaces.example.json，主机工具读取相邻的 .host-policy.json。个人配置与凭据放在源码仓库之外。

安装新版构建后重启 Bridge，并在 ChatGPT 插件管理中刷新工具资料，再打开新对话。推送 GitHub 不会自动部署本机服务，也不会修改 ChatGPT 连接的总简介。

详细接口见 [工具清单](docs/tools.md)，状态与保留机制见 [工作管理](docs/work-management.md)，运行权限见 [安全说明](SECURITY.md)。[英文说明](README.en.md)提供相同的安装入口，旧版说明保存在 Git 历史中；当前 Windows 测试仍有已知平台相关失败，具体结果以每次发布验证记录为准。

本项目基于 [wudy29/engineering-bridge](https://github.com/wudy29/engineering-bridge) 修改。
