# 游学纪 React UX Demo

这是桌面端 MVP 的可交互 H5 Demo，不包含真实的视频压缩、场景检测、ASR 或 PDF 服务。

## 运行

```bash
npm install
npm --prefix renderer install
npm run dev
```

浏览器访问 `http://127.0.0.1:5173/`。

## 设计参考

- 视频工作台：参考 [BroderQi/Storyboard](https://github.com/BroderQi/Storyboard) 的素材信息、多视图关键帧、时间轴和批量任务反馈方式，并改写为研学内容工作流。
- 默认模板：参考用户提供的小红书研学手册方向，以“学习目标—观察证据—知识卡—反思问题—结论”组织内容；页面由 H5/CSS 实时渲染，不使用截图模拟。

## 可演示流程

1. 工作台导入示例视频并进入分析结果。
2. 按场景或关键帧进行三态选择。
3. 校订选中场景的转写文字。
4. 选择模板并用真实 HTML/CSS 预览默认“自然观察手账”。
5. 模拟生成游学片段 PDF。
6. 在游学片段列表选择内容并配置游学笔记封面。

## 概念稿

概念稿保存在 `../assets/ux-concepts/`，实现中的界面文字和控件均为 React 原生元素，并未把概念截图作为界面背景。
