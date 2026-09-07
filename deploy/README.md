# deploy

该目录用于桌面安装包发布与安装验证。

- `electron-builder.json`：安装包构建配置，输出 macOS `pkg` 与 Windows `nsis` 安装程序。
- `build-installers.cjs`：统一构建入口，会先构建渲染层、准备不含 AI 秘钥的初始化数据，再执行打包。
- `verify-macos-installer.cjs`：挂载 `dmg`、复制 `.app`、触发首次初始化，并校验默认账号登录与样例资源是否齐全。

常用命令：

```bash
npm run build:installers
npm run build:installers:mac
npm run build:installers:win
npm run verify:installer:mac
```
