# Electron 应用技术设计方案 v1.1

> 本方案基于 Electron 官方进程模型、安全和 IPC 文档整理，服务于“研学笔记”桌面端。当前只定义边界与可演进结构，不实现云端接口、真实媒体分析或远程同步。

## 1. 设计目标

### 1.1 前后端分离

在 Electron 中，“前端/后端”不是传统 Web 的两台服务器，而是明确的进程和模块边界：

- **Renderer（前端）**：React 页面、交互状态、表单校验和展示逻辑；不直接读写本地文件，不直接调用 Electron/Node API。
- **Preload（安全桥）**：只暴露经过命名和参数约束的应用能力，不暴露原始 `ipcRenderer`、`fs` 或 Node 全局对象。
- **Main（桌面后端）**：窗口生命周期、IPC 路由、文件选择、权限校验、任务调度和应用级配置。
- **Domain / Services（业务后端）**：视频资产、场景、关键帧、转写、模板和 PDF 的领域服务；通过接口访问存储，不依赖具体文件系统实现。
- **Storage / API Adapters（基础设施）**：当前使用本地文件夹；未来可切换为云端 API、对象存储或同步服务，Renderer 和领域层不感知切换细节。

Electron 官方将应用划分为 main process 和 renderer process；需要 CPU 密集或易崩溃任务时，优先考虑 `utilityProcess`，而不是把任务塞进主进程。[Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)

### 1.2 本地优先、云端兼容

第一阶段以本地文件夹作为数据源，保证离线可用；所有读写能力先定义为接口（Port），由本地适配器（Adapter）实现。未来接入云端时，只替换适配器和配置，不改 React 页面和领域对象。

## 2. 推荐代码结构

当前仓库已经具备最小 Electron 壳和 React 渲染层。随着功能增加，建议演进为以下结构：

Renderer 的生产构建使用 Vite `--base ./`，确保 Electron `loadFile()` 加载时 CSS、JavaScript 和图片都以 `index.html` 为基准解析；开发模式仍通过 `ELECTRON_RENDERER_URL` 加载本地 Vite 服务。

```text
travel-study-electron/
├─ electron/
│  ├─ main.cjs                  # 应用生命周期、窗口、协议和安全策略
│  ├─ preload.cjs               # contextBridge 安全桥
│  ├─ ipc/                      # IPC channel、sender 校验、DTO 映射
│  │  ├─ asset.ipc.cjs
│  │  ├─ project.ipc.cjs
│  │  └─ export.ipc.cjs
│  ├─ services/                 # 桌面后端用例编排
│  │  ├─ project-service.cjs
│  │  ├─ media-service.cjs
│  │  └─ export-service.cjs
│  ├─ infrastructure/           # 外部系统适配器
│  │  ├─ storage/
│  │  │  ├─ local-file-storage.cjs
│  │  │  └─ cloud-storage.cjs       # 未来实现
│  │  ├─ api/
│  │  │  ├─ api-client.cjs
│  │  │  └─ cloud-api-adapter.cjs   # 未来实现
│  │  └─ media/
│  │     ├─ ffmpeg-runner.cjs
│  │     └─ analysis-worker.cjs
│  └─ workers/                  # utilityProcess worker 入口
├─ renderer/
│  └─ src/
│     ├─ app/                   # 路由、全局状态、错误边界
│     ├─ features/              # video-import、scene-selection、template、library
│     ├─ components/            # 纯展示组件
│     ├─ services/              # 只调用 window.electronAPI 的前端 client
│     └─ types/                 # Renderer 侧 DTO / Window 类型
├─ shared/
│  ├─ contracts/                # IPC 请求响应、领域 DTO、错误码
│  └─ constants/
└─ docs/
```

当前阶段的 `electron/main.cjs`、`electron/preload.cjs` 和 `renderer/` 是该结构的最小可运行版本；新增业务能力时应按上面的边界拆分，而不是在 React 组件内直接引入 `fs` 或 `electron`。

## 3. 进程职责与数据流

```text
React Renderer
    │ window.electronAPI（白名单方法）
    ▼
Preload / contextBridge
    │ ipcRenderer.invoke(channel, request)
    ▼
Main IPC Handler ── sender 校验、参数校验、权限校验
    │
    ├─ Domain Service ── 业务规则、任务状态、错误码
    │       │
    │       ├─ Local Repository / Local File Storage（当前）
    │       └─ Cloud Repository / Cloud API（未来）
    │
    └─ utilityProcess ── FFmpeg、关键帧、ASR、视觉分析等重任务
```

IPC 应使用 `contextBridge` 暴露一组最小化、语义化的方法，例如 `project.list()`、`asset.importVideo()`、`export.createPdf()`；不要把 `ipcRenderer.send`、`ipcRenderer.on` 或通用 `send(channel, payload)` 原样暴露给页面。Electron 官方 IPC 和 Context Isolation 文档明确建议“一条 IPC 消息对应一个受控方法”，并避免同步 IPC。[IPC](https://www.electronjs.org/docs/latest/tutorial/ipc) · [Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)

## 4. 本地文件夹存储方案

### 4.1 工作区与应用配置分离

大体积视频、代理视频和图片不应默认塞进 Electron 的 `userData`。应用应让用户选择一个“研学工作区”目录；`app.getPath('userData')` 只保存配置、索引、日志和小型缓存。Electron 官方也建议在 `userData` 下使用应用专属子目录，并避免在那里保存大型文件。[app.getPath](https://www.electronjs.org/docs/latest/api/app)

```text
用户选择的研学工作区/
├─ projects/
│  └─ {projectId}/
│     ├─ project.json             # 项目元数据和版本
│     ├─ media/
│     │  ├─ original/             # 原始导入视频/图片/音频
│     │  ├─ proxy/                 # 压缩代理视频
│     │  ├─ frames/                # 关键帧
│     │  └─ audio/                 # 从视频切出的音频
│     ├─ media/
│     │  ├─ scenes.json            # 场景分割结果
│     │  ├─ keyframes.json         # 关键帧元数据
│     │  └─ transcripts.json       # ASR 结果与置信度
│     └─ pdf-notes/
│        ├─ fragments/             # 游学片段 PDF
│        └─ notes/                 # 游学笔记 PDF
└─ .travel-study/
   ├─ index.json                   # 工作区索引
   └─ migrations/                  # 元数据迁移记录

应用 userData/
└─ travel-study/
   ├─ settings.json
   ├─ recent-workspaces.json
   ├─ logs/
   └─ cache/
```

### 4.2 存储接口（Port）

领域层只依赖以下抽象，不依赖 `fs`、路径拼接或 HTTP：

```ts
export interface AssetStorage {
  put(input: Readable | Uint8Array, meta: AssetMeta): Promise<StoredAsset>
  open(assetId: string): Promise<Readable>
  stat(assetId: string): Promise<AssetStat>
  remove(assetId: string): Promise<void>
}

export interface StudyTourRepository {
  listProjects(query?: ProjectQuery): Promise<ProjectSummary[]>
  getProject(projectId: string): Promise<Project>
  saveProject(project: Project): Promise<void>
}
```

当前实现：`LocalFileStorage` + `LocalStudyTourRepository`。

未来实现：`CloudObjectStorage` + `CloudStudyTourRepository`，内部可调用云端 REST/GraphQL API 和对象存储。接口返回统一的领域 DTO，Renderer 不需要知道数据来自本地还是云端。

## 5. 云端 API 兼容策略（暂不实现）

1. **统一领域 DTO**：项目、资产、场景、关键帧、转写和导出任务使用版本化 DTO，例如 `ProjectV1`、`AssetRefV1`。
2. **仓储接口隔离**：业务用例依赖 `StudyTourRepository`，不依赖 `fetch` 或具体云厂商 SDK。
3. **Provider 配置**：`storage.mode = local | cloud`；默认 `local`，未来通过配置和登录态切换。
4. **资产引用而非绝对路径**：领域对象保存 `assetId`、`relativePath`、`mimeType`、`sha256` 和 `size`，不要把 Windows/macOS 绝对路径写入可同步数据。
5. **任务模型统一**：本地 FFmpeg/ASR 任务和云端异步任务都映射为 `TaskStatus`（queued/running/succeeded/failed/cancelled），前端只订阅任务状态。
6. **离线优先**：本地工作区可独立打开；未来云端同步采用 outbox/change-log，不阻塞本地视频编辑。
7. **错误码稳定**：适配器把文件系统错误、HTTP 错误和鉴权错误映射到统一错误码，避免 UI 依赖平台异常文本。

## 6. Electron 安全与兼容性基线

- `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`。
- Renderer 不直接访问 Node.js、文件系统或原始 IPC。
- IPC handler 校验 `sender`、请求参数和工作区路径，拒绝越界路径（path traversal）。
- 默认限制导航和新窗口，拒绝不必要的权限请求。
- 为生产页面设置严格 CSP；不加载不受信任的远程脚本。
- 生产环境优先使用受控自定义协议（如 `app://`）而不是直接依赖 `file://`；Electron 安全清单明确建议避免 `file://`。[Security](https://www.electronjs.org/docs/latest/tutorial/security) · [protocol.handle](https://www.electronjs.org/docs/latest/api/protocol)
- FFmpeg、视觉分析和 ASR 等 CPU/内存密集任务放入 `utilityProcess` 或独立 worker，主进程只负责调度和生命周期。
- 保持 Electron 主版本和 Chromium 安全更新，升级时逐个主版本验证 Breaking Changes。

## 7. 分阶段落地

### Phase 1：当前 MVP

- 保留 `renderer/` React UX Demo。
- 完成工作区选择、项目索引、视频复制和元数据 JSON。
- 通过 preload 暴露最小化的文件导入/项目查询接口。

### Phase 2：媒体处理

- 引入 FFmpeg runner 和 utility process。
- 产出 proxy、scene、keyframe、transcript 任务及可恢复状态。

### Phase 3：文档生成

- 模板渲染、PDF 输出和游学笔记合并。
- 将本地输出统一映射为 `StoredAsset`，为云端上传预留实现。

### Phase 4：云端兼容

- 新增 cloud adapter、认证、同步 outbox 和冲突策略。
- 不修改 Renderer 的领域交互，只替换 provider 和任务执行器。

## 8. 研究依据

- [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Electron Security Checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron IPC Tutorial](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron Utility Process API](https://www.electronjs.org/docs/latest/api/utility-process)
- [Electron app.getPath API](https://www.electronjs.org/docs/latest/api/app)
- [Electron protocol API](https://www.electronjs.org/docs/latest/api/protocol)
