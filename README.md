# AI Search Scorer / AI 搜索评分插件

## 简介 / Overview

AI Search Scorer 是一个浏览器扩展，用于在搜索结果页面上进行评分或标注，帮助快速识别和整理有价值的结果。This extension overlays lightweight scoring/annotation UI on search result pages to keep track of what matters.

## 功能 / Features

- 在搜索结果旁显示评分或标注控件，便于快速打分。
- 轻量前端实现，加载即用，无需后端服务。
- 图标与弹窗界面（popup）提供简单的控制与状态展示。

## 安装 / Installation

1. 克隆或下载本仓库：`git clone https://github.com/MeandLargevilla/AI-Search-Scorer.git`
2. 打开 Chrome/Edge 扩展管理：`chrome://extensions` 或 `edge://extensions`。
3. 开启“开发者模式”。
4. 选择“加载已解压的扩展程序”，指向仓库根目录（包含 manifest.json 的文件夹）。

## 使用 / Usage

- 打开支持的搜索页面，扩展会自动注入前端脚本，在结果项旁展示评分/标注控件。
- 点击工具栏图标可打开弹窗（popup）进行额外设置或查看状态（若代码中已有相关逻辑）。

## 开发 / Development

- 代码入口：content script 与 background 脚本位于根目录（content.js, background.js）。
- 样式与弹窗：popup.html / popup.js / styles.css。
- 如需打包更新，请保持 manifest.json 与 icons 目录一致。

## 目录结构 / Structure

- background.js — 后台脚本
- content.js — 内容脚本，注入搜索页
- popup.html / popup.js — 扩展弹窗界面
- styles.css — 样式
- icons/ — 扩展图标与资源
- manifest.json — 扩展清单

## 许可 / License

本仓库未声明许可证（No license specified）。如需开源或分发，请先补充合适的 License。
