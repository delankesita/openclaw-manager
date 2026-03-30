import * as vscode from 'vscode';
import { OpenClawManager } from '../manager/manager';
import { InstanceStatus } from '../models/instance';

export class StatusBarService implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private manager: OpenClawManager;
    private updateInterval?: NodeJS.Timeout;

    constructor(manager: OpenClawManager) {
        this.manager = manager;
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        
        this.statusBarItem.command = 'openclawManager.openDashboard';
        this.statusBarItem.tooltip = 'OpenClaw Manager - Click to open dashboard';
        this.update();
        this.statusBarItem.show();
        
        // Update every 10 seconds
        this.updateInterval = setInterval(() => this.update(), 10000);
    }

    update(): void {
        const instances = this.manager.getInstances();
        const running = instances.filter(i => i.status === InstanceStatus.Running).length;
        const total = instances.length;
        
        if (total === 0) {
            this.statusBarItem.text = '$(server) OpenClaw: No instances';
            this.statusBarItem.backgroundColor = undefined;
        } else if (running === 0) {
            this.statusBarItem.text = `$(server) OpenClaw: ${running}/${total} running`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else if (running < total) {
            this.statusBarItem.text = `$(server) OpenClaw: ${running}/${total} running`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this.statusBarItem.text = `$(server) OpenClaw: ${running}/${total} running`;
            this.statusBarItem.backgroundColor = undefined;
        }
    }

    dispose(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        this.statusBarItem.dispose();
    }
}
