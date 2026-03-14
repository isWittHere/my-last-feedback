# My Last Feedback v0.2.0 Release Notes

## 🎯 Release Summary

本版本完成 `0.2.0` 版本升级与 Windows 发行包构建，统一了 Node、前端与 Tauri 后端版本元数据，并输出可分发压缩包。

## ✅ Changes

- 升级根项目版本
  - `package.json` → `0.2.0`
- 升级前端应用版本
  - `app/package.json` → `0.2.0`
- 升级 Tauri Rust 包版本
  - `app/src-tauri/Cargo.toml` → `0.2.0`
- 升级 Tauri 配置版本
  - `app/src-tauri/tauri.conf.json` → `0.2.0`
- 构建并打包 Windows 发行目录
  - `dist/win-x64/my-last-feedback/`
- 生成压缩包
  - `dist/win-x64/my-last-feedback-win-x64.zip`

## 📦 Artifacts

- Windows package directory:
  - `dist/win-x64/my-last-feedback/`
- Windows zip archive:
  - `dist/win-x64/my-last-feedback-win-x64.zip`

## 🧪 Build Verification

- Tauri release build completed successfully
- Frontend build (`tsc + vite build`) completed successfully
- Packaging script completed successfully

## ℹ️ Notes

- 构建期间出现 Vite chunk size 警告，但不影响本次发行产物生成。
- 本次发布以版本升级与发行打包为主，不包含功能层新增说明。
