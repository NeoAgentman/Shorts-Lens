# Shorts Lens

Shorts Lens 是一个 Chrome 扩展，用于在 YouTube Shorts 播放页直接显示播放量和发布日期，并在本地自动收集近期爆款 Shorts，帮助创作者刷对标、找灵感、沉淀选题素材。

## 功能

- 在 Shorts 播放区域显示当前视频播放量。
- 显示当前视频发布日期，格式为 `YYYY-MM-DD`。
- 将大播放量格式化为 `K`、`M`、`B`。
- 支持 Shorts 上下滑切换。
- 直接读取当前 Shorts 页面已有数据。
- 按 Shorts video ID 去重。
- 按规则自动收集近期爆款 Shorts，最近天数可选不限、7 天或 30 天，最低播放量以百万为单位输入。
- 在浏览器标签页中预览所有本地记录。
- 支持按勾选项、筛选结果或全部记录导出 CSV。
- 可选择导出后自动删除本次导出的记录。
- 不调用外部 API，不上传浏览数据。

## 安装

1. 下载或克隆本仓库。
2. 打开 Chrome 的 `chrome://extensions/`。
3. 开启 `Developer mode`。
4. 点击 `Load unpacked`。
5. 选择本扩展目录。
6. 打开任意 YouTube Shorts 页面，例如 `https://www.youtube.com/shorts/...`。

## 使用

打开扩展 popup 后，可以设置：

- 是否启用爆款收集。
- 最近天数：不限、7 天或 30 天。
- 最低播放量：以百万为单位输入，例如 `1` 表示 1,000,000。
- 是否导出后自动删除记录。

点击 `打开记录` 可进入完整记录页。记录页支持搜索、排序、勾选导出、打开 Shorts 链接、导出 CSV 和清空记录。

导出规则：

- 如果勾选了记录，只导出勾选记录。
- 如果没有勾选记录，导出当前筛选结果。
- 如果开启了导出后清理，只删除本次实际导出的记录。

CSV 字段：

- 收集时间
- Shorts 链接
- 播放量
- 发布日期
- 视频描述

## 隐私

Shorts Lens 是本地优先工具。

- 不采集分析数据。
- 不把 YouTube 数据发送到任何服务器。
- 不使用外部 API。
- 只读取当前浏览器中的 YouTube 页面。
- 收集记录保存在 Chrome 扩展本地存储中。
- CSV 文件由浏览器在本地生成。

## 权限说明

- `https://www.youtube.com/*`：在 YouTube 页面运行并识别 Shorts。
- `scripting`：扩展安装或浏览器启动后，向已经打开的 YouTube 标签页注入脚本。
- `storage`：保存本地设置和本地收集记录。
- `tabs`：查找已经打开的 YouTube 标签页。

## 限制

YouTube 前端结构经常变化。Shorts Lens 依赖当前 Shorts 页面中已经加载的数据，因此 YouTube 页面结构变化后可能需要更新解析逻辑。

部分 Shorts 在页面数据尚未加载完成时可能暂时不显示记录。扩展会在后台重试，并且只有匹配到当前 video ID 后才会渲染或收集。

## 开发

修改扩展后，在 `chrome://extensions/` 中重新加载扩展，然后刷新已打开的 YouTube 标签页。

常用检查：

```sh
node --check content.js
node --check bridge.js
node --check popup.js
node --check records.js
node --check background.js
node --check scripts/generate-icons.js
python3 -m json.tool manifest.json >/dev/null
```

重新生成图标：

```sh
node scripts/generate-icons.js
```

## 许可证

MIT License
