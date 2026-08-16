# 前端架构与设计系统规范 v1.0

## 1. 目标与适用范围

本规范适用于 `renderer/` 下的 React 页面、CSS、交互组件和模板编辑界面，并定义 `packages/ui` 作为跨端 UI 包边界，解决三类问题：

1. 所有页面使用同一套配色、间距、字体、圆角和状态表达。
2. 文本输入框、按钮、列表、表单等通用 UI 只由标准组件库提供。
3. 未来支持设置页切换主题时，不修改业务组件和页面结构；当前只交付默认主题。

## 2. 分层原则

```text
packages/ui/
├─ src/tokens.css        # 跨端共享的语义令牌
└─ README.md             # Web 与 React Native 的复用边界

renderer/src/
├─ app/                 # 应用壳、路由、主题 Provider、错误边界
├─ components/
│  ├─ primitives/       # Button、Input、Select、TextArea、IconButton
│  ├─ layout/            # Page、Toolbar、Panel、SplitView、Stack
│  ├─ data-display/      # List、Table、Badge、Stat、EmptyState
│  ├─ feedback/          # Toast、Modal、Progress、InlineMessage
│  └─ forms/             # FormField、Form、FieldGroup、ValidationMessage
├─ features/             # video-import、scene-selection、template、library
│  └─ */components/      # 仅允许组合标准组件，不复制基础控件样式
├─ theme/
│  ├─ tokens.css         # 语义 token 与默认主题
│  ├─ themes.css         # 未来主题选择器
│  └─ ThemeProvider.jsx
└─ styles/
   ├─ globals.css        # reset、基础排版、焦点态
   └─ utilities.css      # 少量布局工具类
```

页面/业务组件只能依赖 `components/`、`theme/` 和自己的 feature 组件；不能直接从页面 CSS 中重新定义 Button、Input、List、Form 等公共组件的结构和视觉规则。

`packages/ui` 不依赖 Electron。桌面端可以使用 DOM/CSS 实现，未来 React Native 端复用同名 token、状态和行为契约，分别提供原生渲染实现。

## 3. 统一设计 Token

### 3.1 默认主题

默认主题命名为 `default`，满足“专业可信赖 + 成长探索感”的定位：

```css
:root,
[data-theme='default'] {
  --color-brand-900: #1E3A5F;      /* 深青蓝：导航、结构 */
  --color-brand-700: #2D5A4A;      /* 森林绿：教育、探索 */
  --color-action-500: #E8913A;     /* 琥珀橙：主要 CTA */
  --color-accent-500: #5B9A8B;     /* 自然青：状态、链接 */
  --color-accent-warm: #B85450;    /* 砖红：风险/人文维度 */
  --color-surface-0: #FFFFFF;
  --color-surface-1: #F5F5F0;      /* 米白画布 */
  --color-surface-2: #ECECEA;      /* 工作区舞台 */
  --color-text-strong: #1F2937;
  --color-text-muted: #6B7280;
  --color-border: #D9DFDC;
  --color-focus: rgba(91, 154, 139, .32);
  --radius-control: 8px;
  --radius-panel: 12px;
  --shadow-panel: 0 8px 24px rgba(30, 58, 95, .08);
}
```

业务样式不得直接写品牌色 hex 值。必须使用语义 token，例如 `var(--color-action-500)`，这样主题切换只需要替换 token 值。

### 3.2 Token 使用规则

- 主色约占结构视觉的 60%，行动色约占 30%，其余为中性色和少量点缀。
- 内容区以米白/白色为主，避免大面积高饱和色。
- 主要行动按钮统一使用琥珀橙；危险动作使用砖红，但不把砖红当作默认 CTA。
- 正文统一使用 `--color-text-strong`，禁止纯黑；辅助文字使用 `--color-text-muted`。
- 圆角、边框、阴影和控件高度必须使用 token 或组件内部常量，页面不得自行覆盖。

## 4. 标准组件库

### 4.1 组件分级

| 级别 | 组件 | 责任 |
| --- | --- | --- |
| Primitive | `Button`、`IconButton`、`Input`、`TextArea`、`Select`、`Checkbox`、`Radio` | 单一交互和可访问性 |
| Layout | `Page`、`Toolbar`、`Panel`、`SplitView`、`Stack`、`Divider` | 统一布局、间距和响应式 |
| Data display | `List`、`ListItem`、`Table`、`Badge`、`Stat`、`Timeline`、`EmptyState` | 列表、状态和数据展示 |
| Feedback | `Toast`、`Modal`、`Drawer`、`Progress`、`Skeleton`、`InlineMessage` | 加载、错误、确认和任务反馈 |
| Forms | `Form`、`FormField`、`FieldGroup`、`ValidationMessage`、`FilePicker` | 表单布局、校验和错误提示 |
| Domain | `SceneList`、`KeyframeGrid`、`TranscriptEditor`、`TemplatePaper` | 由标准组件组合的业务组件 |

### 4.2 组件 API 约束

- 组件通过 props/slots 接收内容和状态，禁止业务页面修改组件内部 DOM 或 CSS。
- 组件必须提供键盘焦点态、禁用态、加载态和错误态；状态不能只依赖颜色。
- 组件的颜色、间距、字体、圆角由 token 或组件样式控制，页面只传递语义属性，例如 `variant="primary"`、`size="sm"`、`status="warning"`。
- 表单组件统一支持 `label`、`description`、`error`、`required` 和 `id`，保证 label 与控件关联。
- 列表组件统一处理空状态、加载状态、选中状态和键盘导航；业务页面不能重新实现一套列表选中逻辑。
- 组件新增时先判断是否能归入已有组件；确有新增需求，必须放入对应 `components/` 子目录并补充示例和使用说明。

### 4.3 页面使用示例

```jsx
import { Button, FormField, Input, List, Panel } from '@/components'

export function ProjectSearchPanel({ projects, query, onQueryChange, onOpen }) {
  return (
    <Panel title="游学片段">
      <FormField label="搜索项目" description="支持名称、地点和日期">
        <Input value={query} onChange={onQueryChange} placeholder="输入关键词" />
      </FormField>
      <List items={projects} onItemClick={onOpen} />
      <Button variant="primary">新建游学片段</Button>
    </Panel>
  )
}
```

页面可以组合组件，但不应出现类似 `.project-page input { ... }`、`.project-page button { ... }` 的公共控件覆盖。

## 5. 主题切换设计

### 5.1 当前实现范围

- 当前只提供 `default` 主题。
- 主题选择器的状态模型和 DOM 挂载点需要预留，但暂不提供第二套色值。
- 设置页未来只负责写入 `themeId`（例如 `default`、`forest`、`academic`），不直接修改页面样式。

推荐在根节点使用属性选择器：

```jsx
<div id="root" data-theme={themeId}>
  <App />
</div>
```

```css
[data-theme='default'] { /* 当前默认 token */ }
[data-theme='forest'] { /* 未来主题，暂不实现 */ }
```

### 5.2 主题切换约束

- 主题只能覆盖语义 token，不能复制整套组件 CSS。
- 组件不得根据主题名称写业务分支，例如 `if (theme === 'forest')`；组件只消费 token。
- 主题切换必须保持同等的可读性、焦点可见性和对比度。
- 用户主题偏好保存到本地设置；未来云端同步时只同步 `themeId`，不上传具体 CSS。
- 系统深色模式可以作为未来主题，不在当前 MVP 范围内。

## 6. CSS 组织与代码评审规则

- 全局样式只包含 reset、排版基础、可访问性和 token，不包含页面业务选择器。
- 组件样式与组件同目录管理，命名使用组件前缀或 CSS Modules，避免全局类名冲突。
- Feature 页面只能组合标准组件；页面级样式只能负责布局容器和业务特有的视觉内容，不得覆盖公共组件内部样式。
- 禁止在 JSX 中写大段 inline style；动态视觉值通过语义 props 或 CSS variable 传入。
- 每个新增公共组件至少补充：API、状态说明、键盘行为、使用示例和一个视觉回归截图。
- Code review 检查项：是否复用了组件、是否使用 token、是否破坏主题切换、是否存在重复 CSS、是否覆盖了可访问性状态。

## 7. 迁移顺序

1. 把现有 `styles.css` 的颜色、间距和圆角提取到 `theme/tokens.css`。
2. 建立 `components/primitives`，优先迁移 Button、Input、Select、Checkbox、FormField。
3. 迁移列表、面板、工具栏和反馈组件。
4. 将 `WorkbenchScreen`、`SelectionScreen`、`TemplateScreen` 等页面改为组合标准组件。
5. 引入 `ThemeProvider` 和 `data-theme="default"`，完成默认主题回归。
6. 再考虑第二套主题和设置页主题选择器。
