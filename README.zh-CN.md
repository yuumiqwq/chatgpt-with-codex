## 当前 fork：持续工作与临时执行

本分支已改用统一工作接口，使用方式见 [工作管理说明](docs/work-management.md) 和 [当前工具表](docs/tools.md)。open_work 同时处理新建、重新启用及接管已有对话；continue_work 复用已有 UUID；run_temp 运行临时任务，不留下新的 Codex 持久对话。默认允许 Codex 直接修改文件、操作 Git 和访问网络，也可按调用选择只读或工作区写入模式。

工作状态、摘要与结果保存在工作区配置旁的独立文件中。归档和删除由调用方决定，未启用按时间自动删除原生历史；执行结果默认保留最近 100 条。移除了重复执行接口及公开参数中的固定确认字符串，已有受控补丁记录仍可使用。

以下保留上游历史说明，其中旧工具名称、只读默认值和人工验收流程不再代表本分支当前接口；以以上两份文档及实时 tools/list 为准。

# Engineering Bridge

中文 README 已成为仓库默认首页：[简体中文](README.md)

English README: [English](README.en.md)

## 受控补丁验证（可选）

校验是可选、按需的：使用 `configure_validation_profile` 为每个已登记工作区配置最多一个固定校验 profile，并要求精确 `CONFIGURE`（不复用 `AUTHORIZE`）；只有显式调用 `validate_controlled_patch` 才会运行校验，且该调用只接受 `patch_task_id`，不能携带命令、argv、shell 文本或超时。`apply_controlled_patch` 不会自动运行校验或测试，普通 Bridge 路径不变，也没有后台校验 worker/queue。命令是非空 argv 数组、不用 shell 字符串，省略超时时默认每步 600 秒、总预算 1200 秒。结果只有 `PASS`、`FAIL`、`INCOMPLETE`；unborn 仓库提案返回 `INCOMPLETE` 且 `reason: "unsupported_unborn_base"`。validation profile 与现有持久状态一起保存在三个本地 0600 sidecar 中，其中包括 `<config>.validation-profiles.json`。校验在临时 detached worktree 中进行，只保护已登记工作区整洁，不是主机级沙箱；只应为可信工作区配置完全信任的命令。详见 [简体中文 README](README.md)。
