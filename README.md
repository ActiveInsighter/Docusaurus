# To Any Docs

基于 Docusaurus、React 和 TypeScript 构建的个人知识文档站，用于长期整理考研复习、计算机基础、算法与项目实践内容。

生产站点由 GitHub Actions 完成检查、构建，并通过 Wrangler 将 `build/` 直接部署到 Cloudflare Pages 项目 `docusaurus-d92`。Cloudflare Pages 仅接收构建产物，不再负责监听 Git 提交并重复构建。

## 本地开发

环境要求：Node.js 20 或更高版本，推荐使用 Node.js 24。

```bash
npm ci
npm run start
```

## 检查与构建

提交代码前建议运行：

```bash
npm run check
```

该命令依次执行 TypeScript 检查、工作流 Run ID 索引测试和 Docusaurus 生产构建。也可以单独运行：

```bash
npm run typecheck
npm run test:workflow-runs
npm run build
npm run serve
```

## GitHub Actions

### Build and deploy Docusaurus

创建 Pull Request 时只执行检查和生产构建；合并或推送到 `main` 时执行：

1. 安装锁定版本的 npm 依赖；
2. 执行 TypeScript 检查；
3. 测试工作流 Run ID 索引逻辑；
4. 构建生产站点；
5. 使用 `cloudflare/wrangler-action` 将 `build/` 部署到 Cloudflare Pages。

部署需要以下 GitHub Actions Secrets：

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

Cloudflare Pages 项目名在工作流中设置为：

```text
docusaurus-d92
```

为避免 Cloudflare Git 集成和 GitHub Actions 重复部署，应在 Cloudflare Pages 的分支控制中关闭自动生产部署，并将 Preview 分支设置为 `None`。完成该设置后，每个 `main` 版本只会由 GitHub Actions 发布一次。

### Verify documentation UI visuals

修改顶部导航栏或侧边栏样式时，Pull Request 会额外运行 Playwright 视觉检查：

1. 构建并启动真实生产站点；
2. 打开包含长数学公式的文档并滚动到正文区域；
3. 分别截取浅色和深色模式；
4. 检查导航栏宽度、透明渐变、分层背景模糊、侧边栏精确激活状态、悬停反馈和横向溢出；
5. 上传截图与浏览器实际计算的布局数据。

### Update generated docs

每天定时、手动触发或相关生成脚本变化时执行：

1. 使用 Playwright 抓取目标页面；
2. 将 HTML 转换为 Docusaurus 文档；
3. 整理多语言代码标签页；
4. 提交并推送生成内容。

### Record workflow runs

Run ID 不再由各工作流自己写入和提交。`Record workflow runs` 会在受跟踪工作流结束后，通过 GitHub Actions API 重新读取真实运行记录并生成索引。

受跟踪工作流包括：

- `Build and deploy Docusaurus`；
- `Update generated docs`；
- `Verify documentation UI visuals`。

这种方式以 GitHub Actions API 为唯一数据源，即使构建、部署或某个中间步骤失败，失败运行的 Run ID 仍会被中央记录器获取，不依赖失败工作流能否执行到最后一个提交步骤。

## 运行记录

统一索引保存在：

```text
.github/workflow-runs/
```

根目录文件：

- `index.json`：所有受跟踪工作流的索引摘要；
- `recent-runs.json`：跨工作流最近 10 次运行，按时间从新到旧排列；
- `recent-run-ids.txt`：跨工作流最近 10 个 Run ID；
- `failed-run-ids.txt`：最近 10 次运行中的失败 Run ID；
- `latest-failed-run.json`：最近一次失败运行的完整信息；
- `latest-failed-run-id.txt`：最近一次失败运行的 Run ID；
- `recent-runs.tsv`：便于直接查看的“工作流、Run ID、结论、链接”表格。

每个工作流还拥有独立目录：

```text
.github/workflow-runs/build/
.github/workflow-runs/update-content/
.github/workflow-runs/docs-ui-visual/
```

每个目录固定保留该工作流最近 10 次运行，并包含：

- `recent-runs.json`：最近 10 次完整运行记录；
- `recent-run-ids.txt`：最近 10 个 Run ID；
- `failed-run-ids.txt`：这 10 次中的失败 Run ID；
- `latest-run.json` 与 `latest-run-id.txt`：最近一次运行；
- `latest-failed-run.json` 与 `latest-failed-run-id.txt`：最近一次失败运行；
- `history.json`：为兼容旧读取逻辑保留，内容与 `recent-runs.json` 相同。

记录器使用串行并发组，提交前会重新拉取 `main`，并在推送冲突时最多重新生成和重试 5 次。状态提交带有 `[CF-Pages-Skip]` 和 `[skip ci]`，且构建工作流忽略 `.github/workflow-runs/**`，因此不会形成重复构建或部署循环。

## 内容生成

生成脚本位于 `Py/`，目标 URL 配置位于 `Py/URL.txt`。生成文档默认写入：

```text
docs/algorithm/programmercarl/
```

本地运行前需要安装 Python 依赖和 Playwright Chromium：

```bash
python -m pip install -r Py/requirements.txt
python -m playwright install chromium
```

## 部署

GitHub Actions 使用以下命令部署已构建的静态文件：

```bash
wrangler pages deploy build \
  --project-name=docusaurus-d92 \
  --branch=main
```

Pull Request 不会部署；只有 `main` 分支的成功构建和在 `main` 上手动触发的工作流会发布生产版本。并发控制会取消同一分支上尚未完成的旧构建，确保优先部署最新提交。
