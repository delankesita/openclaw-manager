import * as vscode from 'vscode';
import { OpenClawManager } from '../manager/manager';
import { Instance, InstanceStatus } from '../models/instance';

export class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;
    public static readonly viewType = 'openclawDashboard';

    private readonly _panel: vscode.WebviewPanel;
    private _manager: OpenClawManager;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, manager: OpenClawManager): void {
        const column = vscode.window.activeTextEditor?.viewColumn;

        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            DashboardPanel.viewType,
            'OpenClaw Manager',
            column || vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        DashboardPanel.currentPanel = new DashboardPanel(panel, manager);
    }

    private constructor(panel: vscode.WebviewPanel, manager: OpenClawManager) {
        this._panel = panel;
        this._manager = manager;

        this.update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(async message => {
            const { command, id } = message;
            
            switch (command) {
                case 'create': await this._manager.create(); break;
                case 'start': await this._manager.start(id); break;
                case 'stop': await this._manager.stop(id); break;
                case 'restart': await this._manager.restart(id); break;
                case 'delete': await this._manager.delete(id); break;
                case 'clone': await this._manager.clone(id); break;
                case 'config': this._manager.openConfig(id); break;
                case 'logs': this._manager.viewLogs(id); break;
                case 'health': await this._manager.healthCheck(id); break;
                case 'channels': await this._manager.configureChannels(id); break;
                case 'model': await this._manager.selectModel(id); break;
                case 'backup': await this._manager.backup(id); break;
                case 'restore': await this._manager.restore(id); break;
                case 'export': await this._manager.exportAll(); break;
                case 'import': await this._manager.import(); break;
            }
        }, null, this._disposables);
    }

    public update(): void {
        this._panel.webview.html = this._getHtml(this._manager.getInstances());
    }

    private _getHtml(instances: Instance[]): string {
        const instancesJson = JSON.stringify(instances);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OpenClaw Manager</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 20px;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        .header h1 { font-size: 20px; font-weight: 500; }
        .btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 14px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
        }
        .btn:hover { background: var(--vscode-button-hoverBackground); }
        .btn.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        .btn.danger { background: #d32f2f; }
        .btn.danger:hover { background: #b71c1c; }
        .btn.small { padding: 4px 8px; font-size: 12px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
        .card {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 16px;
        }
        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        .card-title { font-weight: 600; font-size: 15px; }
        .status {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
        }
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }
        .status-dot.running { background: #4caf50; box-shadow: 0 0 6px #4caf50; }
        .status-dot.stopped { background: #9e9e9e; }
        .status-dot.starting, .status-dot.stopping { background: #ff9800; animation: pulse 1s infinite; }
        .status-dot.error { background: #f44336; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .meta {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-bottom: 12px;
            font-size: 12px;
        }
        .meta-item label { color: var(--vscode-descriptionForeground); font-size: 10px; text-transform: uppercase; }
        .meta-item span { display: block; font-weight: 500; }
        .actions { display: flex; gap: 6px; flex-wrap: wrap; }
        .empty {
            text-align: center;
            padding: 60px 20px;
            color: var(--vscode-descriptionForeground);
        }
        .empty h2 { font-size: 16px; margin-bottom: 8px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🦞 OpenClaw Manager</h1>
        <div>
            <button class="btn secondary" onclick="post('import')">Import</button>
            <button class="btn secondary" onclick="post('export')">Export</button>
            <button class="btn" onclick="post('create')">+ Create</button>
        </div>
    </div>
    
    <div id="grid" class="grid"></div>
    
    <script>
        const vscode = acquireVsCodeApi();
        let instances = ${instancesJson};
        
        function post(cmd, id) {
            vscode.postMessage({ command: cmd, id });
        }
        
        function render() {
            const grid = document.getElementById('grid');
            
            if (instances.length === 0) {
                grid.innerHTML = '<div class="empty"><h2>No instances</h2><p>Create your first OpenClaw instance to get started</p></div>';
                return;
            }
            
            grid.innerHTML = instances.map(i => \`
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">\${i.name}</span>
                        <div class="status">
                            <span class="status-dot \${i.status}"></span>
                            <span>\${i.status}</span>
                        </div>
                    </div>
                    <div class="meta">
                        <div class="meta-item"><label>Port</label><span>\${i.port}</span></div>
                        <div class="meta-item"><label>Model</label><span title="\${i.model || 'default'}">\${(i.model || 'default').split('/').pop()}</span></div>
                        <div class="meta-item"><label>Health</label><span>\${i.health?.status || '-'}</span></div>
                    </div>
                    <div class="actions">
                        \${i.status === 'running' ? \`
                            <button class="btn secondary small" onclick="post('stop', '\${i.id}')">Stop</button>
                            <button class="btn secondary small" onclick="post('restart', '\${i.id}')">Restart</button>
                        \` : \`
                            <button class="btn small" onclick="post('start', '\${i.id}')">Start</button>
                        \`}
                        <button class="btn secondary small" onclick="post('config', '\${i.id}')">Config</button>
                        <button class="btn secondary small" onclick="post('logs', '\${i.id}')">Logs</button>
                        <button class="btn secondary small" onclick="post('health', '\${i.id}')">Health</button>
                        <button class="btn secondary small" onclick="post('model', '\${i.id}')">Model</button>
                        <button class="btn secondary small" onclick="post('channels', '\${i.id}')">Channels</button>
                        <button class="btn secondary small" onclick="post('backup', '\${i.id}')">Backup</button>
                        <button class="btn secondary small" onclick="post('clone', '\${i.id}')">Clone</button>
                        <button class="btn danger small" onclick="post('delete', '\${i.id}')">Delete</button>
                    </div>
                </div>
            \`).join('');
        }
        
        render();
    </script>
</body>
</html>`;
    }

    public dispose(): void {
        DashboardPanel.currentPanel = undefined;
        this._panel.dispose();
        this._disposables.forEach(d => d.dispose());
    }
}
