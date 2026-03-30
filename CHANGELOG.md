# Changelog

All notable changes to this project will be documented in this file.

## [0.4.0] - 2026-03-30

### Added
- **Channel Configuration UI**: Visual interface for configuring messaging channels
  - Support for Feishu, DingTalk, WeCom, Discord, Slack, Telegram
  - Connection mode selection (WebSocket, Stream, Webhook)
  - Credential input with validation
  - Test connection functionality
- **Model Selector**: Choose AI models for instances
  - Support for NVIDIA NIM (free models), OpenAI, Anthropic, DeepSeek, Ollama
  - Model comparison with context window and pricing
  - Recommended models highlighted
  - API key configuration per provider
- **Auto Update**: Extension update management
  - Automatic update checking (configurable interval)
  - Download and install updates from GitHub releases
  - Update notifications with release notes

### Improved
- More comprehensive model provider support
- Better type definitions for channel configuration

## [0.3.0] - 2026-03-30

### Added
- Quick Setup with templates (Developer, Chatbot, Research, etc.)
- Backup and restore functionality
- Import/Export instance configurations
- Status bar showing running/total instances
- Logging service with rotation
- Notification service with progress support
- Configuration for backup directory and health check interval

### Improved
- Reduced package size by 30% with .vscodeignore
- Better error handling and user feedback
- More configuration options

## [0.2.0] - 2026-03-30

### Added
- Template system for quick instance setup
- Backup service with archiving
- Import/Export service
- Quick setup wizard
- Advanced setup webview

### Improved
- TypeScript compilation
- Package structure

## [0.1.0] - 2026-03-30

### Added
- Initial release
- Multi-instance management (create, start, stop, restart, delete)
- Instance isolation with separate state directories
- Clone existing instances
- Dashboard UI with visual controls
- Tree view in sidebar
- Health monitoring with CPU/memory usage
- Quick access to config files and logs
- Auto-start instances on VS Code launch (configurable)

### Features
- **Dashboard**: Visual control panel for all instances
- **Tree View**: Sidebar showing instance status
- **Instance Management**: Full lifecycle management
- **Clone & Promote**: Clone instances for testing
- **Health Checks**: Monitor CPU, memory, uptime
- **File Access**: Quick config and log access

## [Unreleased]

### Planned
- Session management
- Role Market integration
- Advanced channel settings
