import * as vscode from 'vscode';
import { OpenClawManager } from '../manager/manager';
import { Instance, InstanceStatus } from '../models/instance';

export class InstancesProvider implements vscode.TreeDataProvider<InstanceItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private manager: OpenClawManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: InstanceItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: InstanceItem): Thenable<InstanceItem[]> {
        if (element?.instance) {
            // Children of an instance
            const items: InstanceItem[] = [
                new InstanceItem('Config', 'config', element.instance),
                new InstanceItem('Logs', 'logs', element.instance)
            ];
            
            if (element.instance.model) {
                items.push(new InstanceItem(`Model: ${element.instance.model}`, 'model', element.instance));
            }
            
            if (element.instance.channels && Object.keys(element.instance.channels).length > 0) {
                items.push(new InstanceItem(`Channels: ${Object.keys(element.instance.channels).join(', ')}`, 'channels', element.instance));
            }
            
            return Promise.resolve(items);
        }

        // Root: list all instances
        const instances = this.manager.getInstances();
        if (instances.length === 0) {
            return Promise.resolve([new InstanceItem('No instances. Click + to create.', 'empty')]);
        }

        return Promise.resolve(
            instances.map(instance => new InstanceItem(instance.name, 'instance', instance))
        );
    }
}

class InstanceItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly type: 'instance' | 'config' | 'logs' | 'model' | 'channels' | 'empty',
        public readonly instance?: Instance
    ) {
        super(label, type === 'instance' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);

        this.contextValue = type;

        if (type === 'instance' && instance) {
            this.description = this.getStatusText(instance.status);
            this.tooltip = `${instance.name}\nPort: ${instance.port}\nStatus: ${instance.status}\nModel: ${instance.model || 'default'}`;
            this.iconPath = this.getStatusIcon(instance.status);
            
            if (instance.status === InstanceStatus.Running) {
                this.command = {
                    command: 'openclawManager.openDashboard',
                    title: 'Open Dashboard'
                };
            }
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
        } else if (type === 'model') {
            this.iconPath = new vscode.ThemeIcon('symbol-keyword');
            this.command = {
                command: 'openclawManager.selectModel',
                title: 'Select Model',
                arguments: [{ instance }]
            };
        } else if (type === 'channels') {
            this.iconPath = new vscode.ThemeIcon('broadcast');
            this.command = {
                command: 'openclawManager.configureChannels',
                title: 'Configure Channels',
                arguments: [{ instance }]
            };
        } else if (type === 'empty') {
            this.iconPath = new vscode.ThemeIcon('info');
            this.command = {
                command: 'openclawManager.create',
                title: 'Create Instance'
            };
        }
    }

    private getStatusText(status: InstanceStatus): string {
        const icons: Record<InstanceStatus, string> = {
            [InstanceStatus.Running]: '●',
            [InstanceStatus.Starting]: '◐',
            [InstanceStatus.Stopping]: '◑',
            [InstanceStatus.Error]: '✗',
            [InstanceStatus.Stopped]: '○'
        };
        return `${icons[status]} Port ${this.instance?.port}`;
    }

    private getStatusIcon(status: InstanceStatus): vscode.ThemeIcon {
        const colors: Record<InstanceStatus, vscode.ThemeColor | undefined> = {
            [InstanceStatus.Running]: new vscode.ThemeColor('charts.green'),
            [InstanceStatus.Starting]: new vscode.ThemeColor('charts.yellow'),
            [InstanceStatus.Stopping]: new vscode.ThemeColor('charts.yellow'),
            [InstanceStatus.Error]: new vscode.ThemeColor('errorForeground'),
            [InstanceStatus.Stopped]: undefined
        };

        const icons: Record<InstanceStatus, string> = {
            [InstanceStatus.Running]: 'check',
            [InstanceStatus.Starting]: 'loading~spin',
            [InstanceStatus.Stopping]: 'loading~spin',
            [InstanceStatus.Error]: 'error',
            [InstanceStatus.Stopped]: 'circle-outline'
        };

        return new vscode.ThemeIcon(icons[status], colors[status]);
    }
}
