# Workflow run state

该目录由 GitHub Actions 自动维护，用于在仓库中直接读取最近的工作流 Run ID、运行结果和日志。

每个工作流使用独立子目录：

```text
build/
update-content/
```

目录内文件含义：

| 文件 | 说明 |
| --- | --- |
| `latest-run-id.txt` | 最近一次 GitHub Actions Run ID |
| `latest-run-url.txt` | 最近一次运行页面链接 |
| `latest-run.json` | 最近一次运行的状态、结论、耗时和各步骤结果 |
| `history.json` | 按开始时间倒序保留最近 10 次运行记录 |
| `latest-log.txt` | 最近一次运行的合并日志与最终摘要 |

这些状态文件由 `scripts/record-workflow-state.mjs` 生成，并由 `scripts/commit-workflow-state.mjs` 提交。状态提交包含 `[skip ci]`，工作流也忽略该目录的变更，因此不会形成循环触发。
