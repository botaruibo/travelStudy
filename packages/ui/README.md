# @travel-study/ui

跨端 UI 包的边界。这里维护不依赖 Electron 的设计令牌、主题契约和组件 API 约定，桌面端与未来 React Native 客户端可以共享同一套语义命名。

当前桌面 Demo 的交互组件仍位于 `renderer/src/components/Shared.jsx`，以减少首次迁移风险；新增通用控件应先在本包定义 API，再由各端实现。桌面端只通过语义 token 使用颜色、间距、圆角和焦点态，不把主题色散落到业务页面。

移动端复用策略：复用 token 名称、状态语义和组件行为契约；React Native 使用对应的原生实现，不直接依赖 DOM/CSS。
