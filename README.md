# 项目简介

## 环境要求
- Node.js >= 18
- Python >= 3.11
- pnpm
- Poetry

## 项目结构
- 前端：待补充
- 后端：待补充
- 配置：.env.example、.gitignore

## 启动方式
1. 安装依赖（前端）：pnpm install
2. 安装依赖（后端）：poetry install
3. 根据 .env.example 创建本地 .env
4. 启动项目：待补充

## Docker 启动
生产模式（构建镜像并运行）：
1. 创建 .env（至少包含 OPENAI_API_KEY，如果需要）
2. 启动：`docker compose up --build`
3. 访问：
   - 后端：`http://localhost:8000`
   - 前端：`http://localhost:3000`

开发模式（热重载）：
1. 启动：`docker compose -f docker-compose.dev.yml up --build`
2. 前端会在容器内执行 `pnpm dev`，后端使用 `uvicorn --reload`

## 导出/导入项目
在左侧项目列表中：
- 点击“导出”可下载项目 JSON（包含大纲、知识图谱、世界观文档与版本快照）。
- 点击“导入”选择导出的 JSON 文件，可恢复为一个同 ID 的项目。

注意：导入会使用导出时的项目 ID，如已存在同 ID 项目会导入失败。您可先删除或改名后再导入。
