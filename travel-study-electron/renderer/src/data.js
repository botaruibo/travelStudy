export const framePositions = [
  "0% 0%",
  "50% 0%",
  "100% 0%",
  "0% 100%",
  "50% 100%",
  "100% 100%",
];

export const scenes = [
  {
    id: "scene-1",
    index: 1,
    title: "入园与集合",
    range: "00:00:00 – 00:02:35",
    frameCount: 4,
    defaultSelected: [0, 1, 2, 3],
    summary: "老师说明今日观察任务，学生在温室入口完成分组并领取观察记录卡。",
  },
  {
    id: "scene-2",
    index: 2,
    title: "导游介绍植物 A",
    range: "00:02:35 – 00:07:48",
    frameCount: 6,
    defaultSelected: [0, 2, 4],
    summary: "导游带领同学们认识植物 A，介绍其形态特征、名称来源、生活习性及在园区中的分布情况。",
  },
  {
    id: "scene-3",
    index: 3,
    title: "温室自由观察",
    range: "00:07:48 – 00:13:24",
    frameCount: 6,
    defaultSelected: [0, 1, 2, 3, 4, 5],
    summary: "学生分组观察叶片与叶脉，用相机记录形态差异，并在记录卡上完成初步描述。",
  },
  {
    id: "scene-4",
    index: 4,
    title: "多肉植物区讲解",
    range: "00:13:24 – 00:17:05",
    frameCount: 5,
    defaultSelected: [],
    summary: "导游介绍多肉植物储水结构与干旱环境适应方式。",
  },
  {
    id: "scene-5",
    index: 5,
    title: "水生植物区观察",
    range: "00:17:05 – 00:21:36",
    frameCount: 5,
    defaultSelected: [],
    summary: "学生观察水生植物叶片浮水与挺水的差异。",
  },
];

export const clipRows = [
  { id: "clip-1", name: "植物园上午场.pdf", source: "植物园研学_上午.mp4", date: "2026-08-15", location: "上海植物园", pages: 8 },
  { id: "clip-2", name: "昆虫观察.pdf", source: "植物园研学_下午.mp4", date: "2026-08-15", location: "上海植物园", pages: 6 },
  { id: "clip-3", name: "动物保护教育.pdf", source: "动物园导览.mp4", date: "2026-08-16", location: "上海动物园", pages: 10 },
  { id: "clip-4", name: "城市博物馆.pdf", source: "博物馆讲解.mov", date: "2026-08-18", location: "上海博物馆", pages: 7 },
];
