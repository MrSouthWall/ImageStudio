# 图作间 · Image Studio

一个在浏览器里用 AI 生图、改图的创作工作台。

**[在线使用](https://mrsouthwall.github.io/ImageStudio/)** · [使用指南](docs/guide.md)

![图作间的「白洞」创作台，输入框中填有一条示例提示词](docs/images/studio.jpg)

## 开始使用

点击右上角「连接 API」，填入自己的 API Key。默认使用 OpenAI，也可填写兼容接口地址。回到创作台，写下画面描述并按 Enter 生成。费用由所选的 API 服务商收取。

## 主要功能

- **对话生图** · 在同一个对话里继续调整画面，也可切换到直接生图。
- **参考图与局部编辑** · 上传或复用参考图，用遮罩、圈选或箭头指出要修改的位置。
- **图库与收藏** · 管理作品、提示词和参考图。创作数据保存在当前浏览器，支持 ZIP 备份。

## 本地运行

使用 Node.js 24。

```sh
npm ci
npm run dev
```

运行 `npm run build` 可生成用于静态部署的 `dist/` 目录。

## 来源与许可

本项目基于 CookSleep 的 gpt_image_playground，采用 MIT 许可证。[上游项目](https://github.com/CookSleep/gpt_image_playground) · [许可证](LICENSE) · [第三方许可](src/assets/third-party-notices.txt)
