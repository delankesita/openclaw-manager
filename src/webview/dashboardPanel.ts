import * as vscode from 'vscode';
import { OpenClawManager } from '../manager/manager';
import { Instance, InstanceStatus } from '../models/instance';

export class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;
    public static readonly viewType = 'openclawDashboard';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _manager: OpenClawManager;

    public static createOrShow(extensionUri: vscode.Uri, manager: OpenClawManager): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            DashboardPanel.viewType,
            'OpenClaw Manager',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri, manager);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, manager: OpenClawManager) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._manager = manager;

        this.update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'createInstance':
                        await this._manager.createInstance();
                        break;
                    case 'startInstance':
                        await this._manager.startInstance(message.id);
                        break;
                    case 'stopInstance':
                        await this._manager.stopInstance(message.id);
                        break;
                    case 'restartInstance':
                        await this._manager.restartInstance(message.id);
                        break;
                    case 'deleteInstance':
                        await this._manager.deleteInstance(message.id);
                        break;
                    case 'cloneInstance':
                        await this._manager.cloneInstance(message.id);
                        break;
                    case 'openConfig':
                        this._manager.openConfig(message.id);
                        break;
                    case 'viewLogs':
                        this._manager.viewLogs(message.id);
                        break;
                    case 'healthCheck':
                        const health = await this._manager.healthCheck(message.id);
                        this._panel.webview.postMessage({
                            command: 'healthUpdate',
                            id: message.id,
                            health
                        });
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public update(): void {
        const instances = this._manager.getInstances();
        this._panel.webview.html = this._getHtmlForWebview(instances);
    }

    private _getHtmlForWebview(instances: Instance[]): string {
        const instancesJson = JSON.stringify(instances);
        const scriptUri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
        const styleUri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css'));

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; script-src 'unsafe-inline' ${this._panel.webview.cspSource};">
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
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .header h1 { font-size: 24px; font-weight: 500; }
        .controls { display: flex; gap: 10px; align-items: center; }
        .search-input {
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 13px;
            outline: none;
        }
        .search-input:focus { border-color: var(--vscode-focusBorder); }
        .create-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .create-btn:hover { background: var(--vscode-button-hoverBackground); }
        .instances { display: grid; gap: 16px; }
        .instance-card {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 16px;
            transition: transform 0.2s;
        }
        .instance-card:hover { border-color: var(--vscode-focusBorder); }
        .instance-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        .instance-name { font-size: 16px; font-weight: 600; }
        .instance-status { display: flex; align-items: center; gap: 6px; font-size: 12px; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; }
        .status-dot.running { background: #4caf50; box-shadow: 0 0 5px #4caf50; }
        .status-dot.stopped { background: #9e9e9e; }
        .status-dot.starting, .status-dot.stopping { background: #ff9800; animation: pulse 1s infinite; }
        .status-dot.error { background: #f44336; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .instance-meta {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 12px;
            font-size: 13px;
        }
        .meta-item { display: flex; flex-direction: column; gap: 4px; }
        .meta-label { color: var(--vscode-descriptionForeground); font-size: 11px; text-transform: uppercase; }
        .meta-value { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .instance-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .action-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .action-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .action-btn.danger { background: #f44336; color: white; }
        .action-btn.danger:hover { background: #d32f2f; }
        .empty-state { text-align: center; padding: 60px 20px; color: var(--vscode-descriptionForeground); }
        .empty-state h2 { font-size: 18px; margin-bottom: 8px; color: var(--vscode-editor-foreground); }
        .health-bar { height: 4px; background: var(--vscode-progressBar-background); border-radius: 2px; margin-top: 4px; overflow: hidden; }
        .health-fill { height: 100%; border-radius: 2px; transition: width 0.3s ease; }
        .health-fill.ok { background: #4caf50; }
        .health-fill.warning { background: #ff9800; }
        .health-fill.error { background: #f44336; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🦞 OpenClaw Manager</h1>
        <div class="controls">
            <input type="text" id="search" class="search-input" placeholder="Search instances..." oninput="render()">
            <button class="create-btn" onclick="createInstance()">+ New Instance</button>
        </div>
    </div>
    
    <div id="instances" class="instances"></div>
    
    <script>
        const vscode = acquireVsCodeApi();
        let instances = ${instancesJson};
        
        function createInstance() { vscode.postMessage({ command: 'createInstance' }); }
        function startInstance(id) { vscode.postMessage({ command: 'startInstance', id }); }
        function stopInstance(id) { vscode.postMessage({ command: 'stopInstance', id }); }
        function restartInstance(id) { vscode.postMessage({ command: 'restartInstance', id }); }
        function deleteInstance(id) { vscode.postMessage({ command: 'deleteInstance', id }); }
        function cloneInstance(id) { vscode.postMessage({ command: 'cloneInstance', id }); }
        function openConfig(id) { vscode.postMessage({ command: 'openConfig', id }); }
        function viewLogs(id) { vscode.postMessage({ command: 'viewLogs', id }); }
        function healthCheck(id) { vscode.postMessage({ command: 'healthCheck', id }); }
        
        function render() {
            const container = document.getElementById('instances');
            const searchQuery = document.getElementById('search').value.toLowerCase();
            
            const filteredInstances = instances.filter(i => 
                i.name.toLowerCase().includes(searchQuery) || 
                i.id.toLowerCase().includes(searchQuery)
            );

            if (filteredInstances.length === 0) {
                container.innerHTML = \`
                    <div class="empty-state">
                        <h2>No instances found</h2>
                        <p>\${instances.length === 0 ? 'Create your first OpenClaw instance to get started' : 'Try a different search term'}</p>
                    </div>
                \`;
                return;
            }
            
            container.innerHTML = filteredInstances.map(instance => \`
                <div class="instance-card">
                    <div class="instance-header">
                        <span class="instance-name">\${instance.name}</span>
                        <div class="instance-status">
                            <span class="status-dot \${instance.status}"></span>
                            <span>\${instance.status.charAt(0).toUpperCase() + instance.status.slice(1)}</span>
                        </div>
                    </div>
                    <div class="instance-meta">
                        <div class="meta-item">
                            <span class="meta-label">Port</span>
                            <span class="meta-value">\${instance.port}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Model</span>
                            <span class="meta-value" title="\${instance.model || 'default'}">\${instance.model || 'default'}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Health</span>
                            <span class="meta-value">\${instance.health?.status || '-'}</span>
                            <div class="health-bar">
                                <div class="health-fill \${instance.health?.status || ''}" 
                                     style="width: \${instance.health?.cpu || 0}%"></div>
                            </div>
                        </div>
                    </div>
                    <div class="instance-actions">
                        \${instance.status === 'running' ? \`
                            <button class="action-btn" onclick="stopInstance('\${instance.id}')">Stop</button>
                            <button class="action-btn" onclick="restartInstance('\${instance.id}')">Restart</button>
                        \` : \`
                            <button class="action-btn" onclick="startInstance('\${instance.id}')">Start</button>
                        \`}
                        <button class="action-btn" onclick="openConfig('\${instance.id}')">Config</button>
                        <button class="action-btn" onclick="viewLogs('\${instance.id}')">Logs</button>
                        <button class="action-btn" onclick="healthCheck('\${instance.id}')">Health</button>
                        <button class="action-btn" onclick="cloneInstance('\${instance.id}')">Clone</button>
                        <button class="action-btn danger" onclick="deleteInstance('\${instance.id}')">Delete</button>
                    </div>
                </div>
            \`).join('');
        }
        
        render();
        
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'healthUpdate') {
                const instance = instances.find(i => i.id === message.id);
                if (instance) {
                    instance.health = message.health;
                    render();
                }
            }
        });
    </script>
</body>
</html>`;
    }

    public dispose(): void {
        DashboardPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
