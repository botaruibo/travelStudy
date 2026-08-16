# 技术文档

## 当前文档

- [游学管理桌面端 MVP 技术架构设计 v1.0](游学管理桌面端MVP_技术架构设计_v1.0.docx)
- [Electron 应用技术设计方案 v1.1](ELECTRON_ARCHITECTURE.md)
- [前端架构与设计系统规范 v1.0](FRONTEND_ARCHITECTURE.md)

## 初始技术边界

- 桌面容器：Electron，主进程负责窗口、文件系统和原生能力边界。
- 渲染层：React + Vite，当前 Demo 位于 `renderer/`。
- 媒体处理：`electron/services/media.cjs` 优先使用 `@ffmpeg-installer/ffmpeg`，并兼容 `FFMPEG_BIN`/`ffmpeg-static`，使用 FFmpeg/FFprobe 完成压缩、时长探测、音频和关键帧处理；在运行环境缺少可执行二进制时提供演示降级并保留告警。
- AI 能力：`electron/services/siliconflow.cjs` 兼容 SenseVoiceSmall 与 DeepSeek JSON 场景分析；通过环境变量切换，未配置密钥时使用本地 fallback。
- 文档输出：`electron/services/pdf.cjs` 生成按场景分页的游学片段 PDF，并支持合并为游学笔记。
- 数据层：`electron/services/database.cjs` 使用 SQLite（sql.js）保存视频、场景、关键帧、片段、笔记和任务；媒体与输出文件按 `userData/travel-study` 分类存储。

## 本轮架构要求

- 前端 Renderer、Preload 安全桥、Electron Main 和领域/基础设施服务分离。
- 当前通过用户选择的本地工作区文件夹完成媒体文件存储和查询；`userData` 只保存配置、索引、日志和小型缓存。
- 文件存储和项目查询必须通过 Port/Adapter 抽象，当前实现本地适配器，未来可替换为云端 API 与对象存储，Renderer 和领域层不感知数据来源。
- FFmpeg、ASR、视觉分析等重任务放入 `utilityProcess` 或独立 worker，避免阻塞 UI 和主进程。
- IPC 通过 preload + `contextBridge` 暴露白名单方法，禁止在 Renderer 直接使用 `fs`、Node.js 或原始 IPC。
- 前端通过统一 token、标准组件库和主题属性管理视觉；页面只能组合组件，不能直接覆盖公共控件样式。
- 当前仅实现 `default` 默认主题，CSS 使用语义变量，为未来设置页主题切换保留兼容结构。

## 安全原则

- Electron 开启 `contextIsolation`，关闭 `nodeIntegration`。
- 文件访问、媒体处理和 AI 请求通过受控 IPC 暴露。
- 默认拒绝渲染层的权限请求和新窗口打开。
