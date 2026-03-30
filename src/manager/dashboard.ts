import * as vscode from 'vscode';
import { Instance, InstanceStatus } from '../models/instance';
import { OpenClawManager } from './manager';

export class OpenClawDashboard {
    private panel?: vscode.WebviewPanel;
    private manager: OpenClawManager;

    constructor(manager: OpenClawManager) {
        this.manager = manager;
    }

    show(): void {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'openclawDashboard',
            'OpenClaw Manager Dashboard',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.html = this.getHtml();
        this.handleMessages();

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        // Update when instances change
        this.manager.onDidChangeInstances(() => {
            this.update();
        });
    }

    private update(): void {
        if (this.panel) {
            this.panel.webview.postMessage({
                type: 'update',
                instances: this.manager.getInstances()
            });
        }
    }

    private handleMessages(): void {
        if (!this.panel) return;

        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'refresh':
                    this.update();
                    break;
                case 'start':
                    await this.manager.startInstance(message.id);
                    break;
                case 'stop':
                    await this.manager.stopInstance(message.id);
                    break;
                case 'restart':
                    await this.manager.restartInstance(message.id);
                    break;
                case 'delete':
                    await this.manager.deleteInstance(message.id);
                    break;
                case 'clone':
                    await this.manager.cloneInstance(message.id);
                    break;
                case 'openConfig':
                    this.manager.openConfig(message.id);
                    break;
                case 'viewLogs':
                    this.manager.viewLogs(message.id);
                    break;
                case 'backup':
                    await this.manager.backupInstance(message.id);
                    break;
                case 'restore':
                    await this.manager.restoreInstance(message.id);
                    break;
                case 'health':
                    await this.manager.healthCheck(message.id);
                    break;
            }
        });
    }

    private getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OpenClaw Manager</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: var(--vscode-font-family);
            padding: 16px;
            color: var(--vscode-editor-foreground);
            background: var(--vscode-editor-background);
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .header h1 {
            font-size: 24px;
            font-weight: 500;
        }
        .header-actions {
            display: flex;
            gap: 8px;
        }
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn:hover {
            opacity: 0.9;
        }
        .instances-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 16px;
        }
        .instance-card {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 16px;
            background: var(--vscode-editor-background);
        }
        .instance-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 12px;
        }
        .instance-name {
            font-size: 16px;
            font-weight: 500;
        }
        .instance-status {
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
        }
        .status-running {
            background: #28a74520;
            color: #28a745;
        }
        .status-stopped {
            background: #dc354520;
            color: #dc3545;
        }
        .status-starting, .status-stopping {
            background: #ffc10720;
            color: #ffc107;
        }
        .status-error {
            background: #dc354520;
            color: #dc3545;
        }
        .instance-info {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
            margin-bottom: 12px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .info-item {
            display: flex;
            gap: 4px;
        }
        .info-label {
            color: var(--vscode-disabledForeground);
        }
        .instance-health {
            display: flex;
            gap: 12px;
            margin-bottom: 12px;
            font-size: 12px;
        }
        .health-item {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .health-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
        }
        .health-ok {
            background: #28a745;
        }
        .health-error {
            background: #dc3545;
        }
        .instance-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .action-btn {
            padding: 4px 8px;
            font-size: 11px;
            border: 1px solid var(--vscode-panel-border);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            border-radius: 4px;
            cursor: pointer;
        }
        .action-btn:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }
        .action-btn-danger {
            color: #dc3545;
            border-color: #dc354540;
        }
        .empty-state {
            text-align: center;
            padding: 48px;
            color: var(--vscode-descriptionForeground);
        }
        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 16px;
        }
        .stats-bar {
            display: flex;
            gap: 24px;
            margin-bottom: 16px;
            padding: 12px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
        }
        .stat-item {
            display: flex;
            flex-direction: column;
        }
        .stat-value {
            font-size: 20px;
            font-weight: 500;
        }
        .stat-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🦐 OpenClaw Manager</h1>
        <div class="header-actions">
            <button class="btn btn-primary" onclick="createInstance()">
                <span>+</span> New Instance
            </button>
            <button class="btn btn-secondary" onclick="refresh()">
                ↻ Refresh
            </button>
        </div>
    </div>

    <div id="stats" class="stats-bar"></div>

    <div id="instances" class="instances-grid"></div>

    <div id="empty" class="empty-state" style="display: none;">
        <div class="empty-state-icon">🦐</div>
        <h3>No Instances Yet</h3>
        <p>Create your first OpenClaw instance to get started</p>
        <button class="btn btn-primary" onclick="createInstance()" style="margin-top: 16px;">
            + Create Instance
        </button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let instances = [];

        function update(data) {
            instances = data.instances || [];
            renderStats();
            renderInstances();
        }

        function renderStats() {
            const stats = {
                total: instances.length,
                running: instances.filter(i => i.status === 'running').length,
                stopped: instances.filter(i => i.status === 'stopped').length,
                error: instances.filter(i => i.status === 'error').length
            };

            document.getElementById('stats').innerHTML = \`
                <div class="stat-item">
                    <span class="stat-value">\${stats.total}</span>
                    <span class="stat-label">Total</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value" style="color: #28a745;">\${stats.running}</span>
                    <span class="stat-label">Running</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">\${stats.stopped}</span>
                    <span class="stat-label">Stopped</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value" style="color: #dc3545;">\${stats.error}</span>
                    <span class="stat-label">Error</span>
                </div>
            \`;
        }

        function renderInstances() {
            const container = document.getElementById('instances');
            const empty = document.getElementById('empty');

            if (instances.length === 0) {
                container.style.display = 'none';
                empty.style.display = 'block';
                return;
            }

            container.style.display = 'grid';
            empty.style.display = 'none';

            container.innerHTML = instances.map(i => \`
                <div class="instance-card">
                    <div class="instance-header">
                        <div class="instance-name">\${i.name}</div>
                        <span class="instance-status status-\${i.status}">\${i.status}</span>
                    </div>
                    <div class="instance-info">
                        <div class="info-item">
                            <span class="info-label">Port:</span>
                            <span>\${i.port}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Model:</span>
                            <span>\${i.model || 'default'}</span>
                        </div>
                    </div>
                    \${i.health ? \`
                    <div class="instance-health">
                        <div class="health-item">
                            <span class="health-dot \${i.health.status === 'ok' ? 'health-ok' : 'health-error'}"></span>
                            <span>Health: \${i.health.status}</span>
                        </div>
                        <div class="health-item">CPU: \${(i.health.cpu * 100).toFixed(1)}%</div>
                        <div class="health-item">MEM: \${(i.health.memory).toFixed(0)}MB</div>
                    </div>
                    \` : ''}
                    <div class="instance-actions">
                        \${i.status === 'stopped' ? \`
                            <button class="action-btn" onclick="start('\${i.id}')">▶ Start</button>
                        \` : ''}
                        \${i.status === 'running' ? \`
                            <button class="action-btn" onclick="stop('\${i.id}')">■ Stop</button>
                            <button class="action-btn" onclick="restart('\${i.id}')">↻ Restart</button>
                        \` : ''}
                        <button class="action-btn" onclick="openConfig('\${i.id}')">⚙ Config</button>
                        <button class="action-btn" onclick="viewLogs('\${i.id}')">📋 Logs</button>
                        <button class="action-btn" onclick="backup('\${i.id}')">💾 Backup</button>
                        <button class="action-btn" onclick="clone('\${i.id}')">⧉ Clone</button>
                        <button class="action-btn action-btn-danger" onclick="del('\${i.id}')">✕ Delete</button>
                    </div>
                </div>
            \`).join('');
        }

        function createInstance() {
            vscode.postMessage({ command: 'createInstance' });
        }

        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }

        function start(id) {
            vscode.postMessage({ command: 'start', id });
        }

        function stop(id) {
            vscode.postMessage({ command: 'stop', id });
        }

        function restart(id) {
            vscode.postMessage({ command: 'restart', id });
        }

        function openConfig(id) {
            vscode.postMessage({ command: 'openConfig', id });
        }

        function viewLogs(id) {
            vscode.postMessage({ command: 'viewLogs', id });
        }

        function backup(id) {
            vscode.postMessage({ command: 'backup', id });
        }

        function restore(id) {
            vscode.postMessage({ command: 'restore', id });
        }

        function clone(id) {
            vscode.postMessage({ command: 'clone', id });
        }

        function del(id) {
            if (confirm('Delete this instance?')) {
                vscode.postMessage({ command: 'delete', id });
            }
        }

        function health(id) {
            vscode.postMessage({ command: 'health', id });
        }

        // Listen for updates
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'update') {
                update(message);
            }
        });

        // Initial load
        vscode.postMessage({ command: 'refresh' });
    </script>
</body>
</html>`;
    }
}
