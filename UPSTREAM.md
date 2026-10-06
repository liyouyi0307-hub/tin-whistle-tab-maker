# 上游来源与改进记录

## 原项目

- 名称：tin-whistle-sheet-generator
- 作者 / 仓库维护者：[TwinkleLee（twinklelee）](https://gitee.com/twinklelee)
- 仓库：[twinklelee/tin-whistle-sheet-generator](https://gitee.com/twinklelee/tin-whistle-sheet-generator)
- 基础提交：[874fffa1ab5bacae4299fa0e0b440b33eab1acad](https://gitee.com/twinklelee/tin-whistle-sheet-generator/commit/874fffa1ab5bacae4299fa0e0b440b33eab1acad)，2026-02-22。
- 许可证声明：原版中英文 README 的许可证章节均写明 **MIT License**。

2026-10-06 从保存的原始源码压缩包下载记录找回上游地址，并读取公开仓库核对。压缩包的五个基础文件与上述提交内容一致（忽略换行符及文件末尾换行差异）。上游位于 Gitee；原版 README 原文保存在 [docs/upstream/README.md](docs/upstream/README.md) 与 [docs/upstream/README.en.md](docs/upstream/README.en.md)。

原压缩包和基础提交没有独立的 LICENSE 文件，也没有单独列明版权年份。本仓库根据上游明确的 MIT 声明补全标准 MIT 正文，按已核验的 2026 年初始提交分别标注原作与后续修改的版权；该 LICENSE 文件是本版本新增的，不是从上游复制的独立许可证文件。

## 本版本的维护者与新增工作

维护者：[liyouyi0307-hub](https://github.com/liyouyi0307-hub)。本项目基于原作继续开发。

| 部分 | 上游基础 | 本版本新增或改进 |
| --- | --- | --- |
| 输入与生成 | 数字简谱转哨笛指法图 | D 调半音解析、Unicode 升降号、范围及格式提示 |
| 指法 | 基础音的固定映射 | 半孔、20 种分八度叉指预设、自定义孔位、来源与适用说明 |
| 筒音 | 原版调性与筒音选项 | D 调筒音 3 / 4、同谱分段筒音、模式切换标注 |
| 八度 | 原版音符八度表示 | 整谱及选段升降八度，保留排版和局部模式 |
| 编辑 | 在输入框中修改简谱 | 谱面选段、双击单音微调、撤销本次微调 |
| 保存 | 浏览器保存与 JSON 曲谱 | 个人指法和分段模式持久化、旧谱兼容、无效导入保护 |
| 验证 | 原压缩包未包含测试 | 40 项自动检查、使用文档及指法资料核验 |

## 指法与曲谱资料

具体指法的来源链接、孔位记录和适用限制见 [叉指资料核验.md](叉指资料核验.md) 与 [D调半音更新说明.md](D调半音更新说明.md)。软件许可证不替代所链接文章、图表和曲谱本身的权利声明。下载用于核验的第三方 PDF、图片和代码保留在本地 `tmp/`，不随本仓库再分发。

`KingdomDance.json` 来自上游，不是本版本原创曲目；`MixedTubeModes.json` 是用于展示分段模式的短音阶练习。发布时保留软件作者与资料来源，不将既有指法或原曲声称为原创发明。
