# To Any Docs

基于 Docusaurus、React 和 TypeScript 构建的个人知识文档站，用于长期整理考研复习、计算机基础、算法与项目实践内容。

生产站点由 Cloudflare Pages 连接 GitHub 仓库并在 `main` 分支更新后自动部署。

## 本地开发

环境要求：Node.js 20 或更高版本，推荐使用 Node.js 22。

```bash
npm ci
npm run start
```

## 检查与构建

提交代码前建议运行：

```bash
npm run check
```

该命令依次执行 TypeScript 检查和 Docusaurus 生产构建。也可以单独运行：

```bash
npm run typecheck
npm run build
npm run serve
```

## GitHub Actions

### Build Docusaurus

在向 `main` 推送、创建 Pull Request 或手动触发时执行：

1. 安装锁定版本的 npm 依赖；
2. 执行 TypeScript 检查；
3. 构建生产站点；
4. 在 `main` 分支记录最近的 Run ID、运行链接、步骤结果、耗时与日志。

### Update generated docs

每天定时、手动触发或相关生成脚本变化时执行：

1. 使用 Playwright 抓取目标页面；
2. 将 HTML 转换为 Docusaurus 文档；
3. 整理多语言代码标签页；
4. 提交生成内容；
5. 记录本次运行结果。

## 运行记录

工作流状态保存在：

```text
.github/workflow-runs/build/
.github/workflow-runs/update-content/
```

每个目录包含：

- `latest-run-id.txt`：最近一次 Run ID；
- `latest-run-url.txt`：最近一次运行页面；
- `latest-run.json`：最近一次运行的结构化状态；
- `history.json`：最近 10 次运行记录；
- `latest-log.txt`：最近一次运行日志。

状态提交使用 `[skip ci]`，并通过工作流路径过滤避免形成重复构建循环。

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

Cloudflare Pages 的推荐构建配置：

```text
Build command: npm run build
Build output directory: build
Node.js version: 22
```

仓库中的 GitHub Actions 负责检查和内容生成；Cloudflare Pages 负责生产部署。
