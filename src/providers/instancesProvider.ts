import * as vscode from 'vscode';
import { OpenClawManager } from '../manager/manager';
import { Instance, InstanceStatus } from '../models/instance';

export class InstancesProvider implements vscode.TreeDataProvider<InstanceItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<InstanceItem | undefined | null | void> = new vscode.EventEmitter<InstanceItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<InstanceItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private manager: OpenClawManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: InstanceItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: InstanceItem): Thenable<InstanceItem[]> {
        if (element) {
            // Return children of an instance (config, logs, etc.)
            return Promise.resolve([
                new InstanceItem('Config', vscode.TreeItemCollapsibleState.None, 'config', element.instance),
                new InstanceItem('Logs', vscode.TreeItemCollapsibleState.None, 'logs', element.instance),
                new InstanceItem('Sessions', vscode.TreeItemCollapsibleState.None, 'sessions', element.instance),
            ]);
        }

        const instances = this.manager.getInstances();
        return Promise.resolve(
            instances.map(instance => new InstanceItem(
                instance.name,
                vscode.TreeItemCollapsibleState.Collapsed,
                'instance',
                instance
            ))
        );
    }
}

class InstanceItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'instance' | 'config' | 'logs' | 'sessions',
        public readonly instance?: Instance
    ) {
        super(label, collapsibleState);

        this.contextValue = type;

        if (type === 'instance' && instance) {
            this.description = `${instance.port} · ${this.getStatusIcon(instance.status)}`;
            this.tooltip = `${instance.name}\nPort: ${instance.port}\nStatus: ${instance.status}`;
            this.iconPath = this.getStatusIconPath(instance.status);
            this.command = {
                command: 'openclawManager.healthCheck',
                title: 'Health Check',
                arguments: [{ instance }]
            };
        } else if (type === 'config') {
            this.iconPath = new vscode.ThemeIcon('settings-gear');
            this.command = {
                command: 'openclawManager.openConfig',
                title: 'Open Config',
                arguments: [{ instance }]
            };
        } else if (type === 'logs') {
            this.iconPath = new vscode.ThemeIcon('output');
            this.command = {
                command: 'openclawManager.viewLogs',
                title: 'View Logs',
                arguments: [{ instance }]
            };
        } else if (type === 'sessions') {
            this.iconPath = new vscode.ThemeIcon('account');
        }
    }

    private getStatusIcon(status: InstanceStatus): string {
        switch (status) {
            case InstanceStatus.Running: return '●';
            case InstanceStatus.Starting: return '◐';
            case InstanceStatus.Stopping: return '◑';
            case InstanceStatus.Error: return '✗';
            default: return '○';
        }
    }

    private getStatusIconPath(status: InstanceStatus): vscode.ThemeIcon {
        switch (status) {
            case InstanceStatus.Running:
                return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
            case InstanceStatus.Starting:
            case InstanceStatus.Stopping:
                return new vscode.ThemeIcon('loading~spin', new vscode.ThemeColor('charts.yellow'));
            case InstanceStatus.Error:
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
            default:
                return new vscode.ThemeIcon('circle-outline');
        }
    }
}
