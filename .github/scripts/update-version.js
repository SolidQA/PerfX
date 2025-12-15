#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * 更新package.json中的版本
 */
function updatePackageJson(filePath, version) {
  const packageJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  packageJson.version = version;
  fs.writeFileSync(filePath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`✓ 更新 ${filePath} 版本为 ${version}`);
}

/**
 * 更新Tauri配置文件中的版本
 */
function updateTauriConfig(filePath, version) {
  const config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  config.version = version;
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n');
  console.log(`✓ 更新 ${filePath} 版本为 ${version}`);
}

/**
 * 更新Cargo.toml中的版本
 */
function updateCargoToml(filePath, version) {
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/^version = ".*"$/m, `version = "${version}"`);
  fs.writeFileSync(filePath, content);
  console.log(`✓ 更新 ${filePath} 版本为 ${version}`);
}

// 获取命令行参数中的版本号
const version = process.argv[2];
if (!version) {
  console.error('❌ 请提供版本号参数');
  console.error('使用方法: node update-version.js <version>');
  process.exit(1);
}

// 验证版本号格式
const versionRegex = /^\d+\.\d+\.\d+(-\w+(\.\d+)?)?$/;
if (!versionRegex.test(version)) {
  console.error('❌ 版本号格式无效，应为 x.y.z 或 x.y.z-prerelease');
  process.exit(1);
}

console.log(`🚀 开始更新版本为 ${version}`);

try {
  // 更新根目录package.json
  updatePackageJson('package.json', version);

  // 更新桌面应用package.json
  updatePackageJson('apps/desktop/package.json', version);

  // 更新Tauri配置
  updateTauriConfig('apps/desktop/src-tauri/tauri.conf.json', version);

  // 更新Cargo.toml
  updateCargoToml('apps/desktop/src-tauri/Cargo.toml', version);

  console.log('✅ 版本更新完成！');
} catch (error) {
  console.error('❌ 版本更新失败:', error.message);
  process.exit(1);
}
