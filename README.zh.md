# OpenClaw Manager

[![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-007ACC?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)
[![License](https://img.shields.io/github/license/openclaw/openclaw-manager)](LICENSE)

[English](README.md) | 中文

> VS Code / Windsurf 扩展，用于管理多个隔离的 OpenClaw Gateway 实例。

OpenClaw Manager 将 ClawdHome 的能力带入你的 IDE。运行多个 OpenClaw "小龙虾"，隔离配置，管理生命周期，监控健康状态，访问日志 - 全部在 VS Code 或 Windsurf 中完成。

## 功能特性

- **多实例管理**：创建、启动、停止、重启、删除 OpenClaw 实例
- **实例隔离**：每个实例拥有独立的状态目录和配置
- **克隆与升级**：克隆现有实例用于测试和实验
- **健康监控**：实时健康检查，显示 CPU/内存使用
- **仪表盘 UI**：可视化控制面板
- **文件管理**：快速访问配置文件和日志
- **树形视图**：侧边栏显示所有实例及状态

## 安装

### 从 VSIX 安装

1. 从 [Releases](https://github.com/openclaw/openclaw-manager/releases) 下载 `.vsix` 文件
2. 打开 VS Code / Windsurf
3. 按 `Cmd+Shift+P` → "Extensions: Install from VSIX..."
4. 选择下载的文件

### 从源码构建

```bash
git clone https://github.com/openclaw/openclaw-manager
cd openclaw-manager
npm install
npm run compile
npm run package
```

## 快速开始

1. 打开命令面板 (`Cmd+Shift+P`)
2. 输入 "OpenClaw: Open Dashboard"
3. 点击 "+ New Instance"
4. 输入实例名称
5. 点击 "Start" 启动 Gateway

## 命令

| 命令 | 描述 |
|---------|-------------|
| `OpenClaw: Open Dashboard` | 打开可视化仪表盘 |
| `OpenClaw: Create New Instance` | 创建新实例 |
| `OpenClaw: Delete Instance` | 删除实例 |
| `OpenClaw: Start Instance` | 启动实例 |
| `OpenClaw: Stop Instance` | 停止实例 |
| `OpenClaw: Restart Instance` | 重启实例 |
| `OpenClaw: Clone Instance` | 克隆实例 |
| `OpenClaw: Open Config File` | 打开配置文件 |
| `OpenClaw: View Logs` | 查看日志 |
| `OpenClaw: Health Check` | 健康检查 |

## 配置

| 设置 | 默认值 | 描述 |
|---------|---------|-------------|
| `openclawManager.instancesDir` | `~/.openclaw-instances` | 实例数据目录 |
| `openclawManager.defaultPort` | `5000` | 新实例默认端口 |
| `openclawManager.autoStart` | `false` | 启动时自动启动实例 |

## 系统要求

- VS Code 1.85+ 或 Windsurf
- 已安装 OpenClaw CLI (`npm install -g @openclaw/cli`)
- Node.js 18+

## 许可证

MIT License - 详见 [LICENSE](LICENSE)
