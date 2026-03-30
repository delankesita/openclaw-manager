# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1] - 2026-03-30

### Added
- Added `openclawManager.healthCheckInterval` setting to configure how often instances are checked.
- Added a search/filter bar to the Dashboard UI.
- Added real-time UI updates (Tree View and Dashboard) when instance status changes.
- Added proper system port availability checking when creating new instances.
- Added Content Security Policy (CSP) to the Webview for better security.

### Improved
- Fixed extension deactivation logic to correctly stop all managed processes.
- Improved log viewing support for Windows (uses `Get-Content -Wait`).
- Optimized instance loading/saving with validation and atomic writes.
- Fixed async command handling in the extension activate function.
- Improved UI styling for status dots and instance cards.

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
- Channel configuration UI
- Model selection from Role Market
- Session management
- Backup and restore
- Import/Export configurations
