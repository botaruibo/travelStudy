# 游学纪 · Electron

面向中小学研学内容生产的 Electron 桌面应用 MVP。应用将视频导入、场景/关键帧筛选、语音转写、模板编辑和游学片段生成整合到一个桌面工作台中，并为后续的游学管理、游学笔记合并和移动端采集预留扩展空间。

> 当前工作区中的 Electron 工程根目录是 `travel-study-electron/`。请先进入该目录再执行安装、开发和构建命令；上一级 `travelStudy/` 是工作区容器，不是本项目的 npm 根目录。

## 当前状态

- 已完成：React + Vite UX Demo、视频工作台交互、场景/关键帧选择、模板预览、游学片段/游学笔记管理页面。
- 当前阶段：MVP 已接入本地 SQLite、任务中心、视频分析流水线、PDF 片段生成和游学笔记合并；SiliconFlow ASR/LLM 为可选云端适配，未配置密钥时使用本地降级流程。
- 设计基线：深青蓝 `#1E3A5F`、森林绿 `#2D5A4A`、琥珀橙 `#E8913A`、米白 `#F5F5F0`。

## 目录结构

```text
travel-study-electron/
├─ electron/              # Electron 主进程与 preload
├─ packages/ui/           # 跨端设计令牌与 UI 包边界
├─ renderer/              # React + Vite 渲染层（当前 UX Demo）
├─ docs/                  # 产品、技术、设计与参考资料
├─ package.json           # Electron 根项目脚本
└─ README.md
```

## 开发运行

需要 Node.js 18+（推荐 Node.js 20+）。项目同时兼容 npm 和 pnpm；Windows 未安装 pnpm 时直接使用 npm 命令即可。

```bash
npm install
npm --prefix renderer install
npm run dev
```

`npm run dev` 会启动 Vite 渲染层并打开 Electron 窗口。仅查看 Web UX 时，也可以直接运行：

```bash
npm --prefix renderer run dev
```

如果已安装 pnpm，原有的 `pnpm install`、`pnpm dev` 命令仍然可用。

生产构建会使用相对资源路径，兼容 Electron 的 `loadFile()`：

```bash
npm run build:renderer
```

视频分析默认使用 `E:\DJI_20260803111824_0018_D.MP4` 作为示例文件，也可以通过 `TRAVEL_STUDY_SAMPLE_VIDEO` 覆盖。云端识别仅从环境变量读取密钥，不写入仓库：

```powershell
$env:SILICONFLOW_API_KEY = "你的密钥"
$env:SILICONFLOW_LLM_MODEL = "deepseek-ai/DeepSeek-V4-Flash"
npm run dev
```

FFmpeg 默认由 `@ffmpeg-installer/ffmpeg` 提供；如需指定系统安装版本，可设置 `FFMPEG_BIN`。未配置 SiliconFlow 密钥时，场景和语音步骤会保留本地降级结果并在任务中心显示告警。

应用数据保存在 Electron `app.getPath('userData')/travel-study` 下；渲染层只通过白名单 IPC 获取视频、场景和输出文件的业务标识，不接收本地绝对路径。

## 构建与启动

```bash
npm run build:renderer
npm start
```

## 文档入口

- [产品文档](docs/product/README.md)
- [技术文档](docs/technical/README.md)
- [Electron 技术设计方案](docs/technical/ELECTRON_ARCHITECTURE.md)
- [前端架构与设计系统规范](docs/technical/FRONTEND_ARCHITECTURE.md)
- [设计文档](docs/design/README.md)
- [文档总览](docs/README.md)
