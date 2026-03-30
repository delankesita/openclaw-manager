# OpenClaw Manager

[![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-007ACC?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)
[![License](https://img.shields.io/github/license/openclaw/openclaw-manager)](LICENSE)
[![Version](https://img.shields.io/github/v/release/openclaw/openclaw-manager)](https://github.com/openclaw/openclaw-manager/releases)

English | [中文](README.zh.md)

> VS Code / Windsurf extension for managing multiple isolated OpenClaw gateway instances.

OpenClaw Manager brings the power of ClawdHome to your IDE. Run multiple OpenClaw "Shrimps" with isolated configurations, manage their lifecycle, monitor health, and access logs - all from within VS Code or Windsurf.

## Features

- **Multi-Instance Management**: Create, start, stop, restart, and delete OpenClaw instances
- **Instance Isolation**: Each instance has its own state directory and configuration
- **Clone & Promote**: Clone existing instances for testing and experimentation
- **Health Monitoring**: Real-time health checks with CPU/memory usage
- **Dashboard UI**: Visual control panel for all instances
- **File Management**: Quick access to config files and logs
- **Tree View**: Sidebar panel showing all instances and their status

## Screenshots

| Dashboard | Tree View |
|-----------|-----------|
| ![Dashboard](docs/assets/dashboard.png) | ![Tree View](docs/assets/treeview.png) |

## Installation

### From VSIX

1. Download the latest `.vsix` from [Releases](https://github.com/openclaw/openclaw-manager/releases)
2. Open VS Code / Windsurf
3. Press `Cmd+Shift+P` → "Extensions: Install from VSIX..."
4. Select the downloaded file

### From Source

```bash
git clone https://github.com/openclaw/openclaw-manager
cd openclaw-manager
npm install
npm run compile
npm run package
```

## Quick Start

1. Open the Command Palette (`Cmd+Shift+P`)
2. Type "OpenClaw: Open Dashboard"
3. Click "+ New Instance"
4. Enter a name for your instance
5. Click "Start" to launch the gateway

## Commands

| Command | Description |
|---------|-------------|
| `OpenClaw: Open Dashboard` | Open the visual dashboard |
| `OpenClaw: Create New Instance` | Create a new instance |
| `OpenClaw: Delete Instance` | Delete an instance |
| `OpenClaw: Start Instance` | Start a stopped instance |
| `OpenClaw: Stop Instance` | Stop a running instance |
| `OpenClaw: Restart Instance` | Restart an instance |
| `OpenClaw: Clone Instance` | Clone an existing instance |
| `OpenClaw: Open Config File` | Open the instance's config |
| `OpenClaw: View Logs` | View instance logs |
| `OpenClaw: Health Check` | Check instance health |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `openclawManager.instancesDir` | `~/.openclaw-instances` | Directory for instance data |
| `openclawManager.defaultPort` | `5000` | Default port for new instances |
| `openclawManager.autoStart` | `false` | Auto-start instances on launch |

## Architecture

```
openclaw-manager/
├── src/
│   ├── extension.ts          # Extension entry point
│   ├── manager/
│   │   └── manager.ts        # Instance management logic
│   ├── models/
│   │   └── instance.ts       # Type definitions
│   ├── providers/
│   │   └── instancesProvider.ts  # Tree view provider
│   └── webview/
│       └── dashboardPanel.ts # Dashboard UI
├── media/                    # Webview assets
├── resources/                # Extension icons
└── package.json              # Extension manifest
```

## Requirements

- VS Code 1.85+ or Windsurf
- OpenClaw CLI installed (`npm install -g @openclaw/cli`)
- Node.js 18+

## Related Projects

- [OpenClaw](https://github.com/openclaw/openclaw) - The AI assistant framework
- [ClawdHome](https://github.com/ThinkInAIXYZ/clawdhome) - macOS native manager

## License

MIT License - see [LICENSE](LICENSE)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
