import * as vscode from 'vscode';
import { OpenClawManager } from './manager/manager';
import { InstancesProvider } from './providers/instancesProvider';
import { DashboardPanel } from './webview/dashboardPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('OpenClaw Manager is now active');

    const manager = new OpenClawManager(context);
    const instancesProvider = new InstancesProvider(manager);

    // Add manager to subscriptions for proper disposal
    context.subscriptions.push(manager);

    // Register tree view
    const treeView = vscode.window.createTreeView('openclawInstances', {
        treeDataProvider: instancesProvider,
        showCollapseAll: true
    });

    // Listen for instance changes to refresh UI
    manager.onInstancesChanged(() => {
        instancesProvider.refresh();
        DashboardPanel.currentPanel?.update();
    });

    // Register commands
    const commands = [
        vscode.commands.registerCommand('openclawManager.openDashboard', () => {
            DashboardPanel.createOrShow(context.extensionUri, manager);
        }),
        vscode.commands.registerCommand('openclawManager.createInstance', async () => {
            await manager.createInstance();
        }),
        vscode.commands.registerCommand('openclawManager.deleteInstance', async (node) => {
            await manager.deleteInstance(node?.instance?.id);
        }),
        vscode.commands.registerCommand('openclawManager.startInstance', async (node) => {
            await manager.startInstance(node?.instance?.id);
        }),
        vscode.commands.registerCommand('openclawManager.stopInstance', async (node) => {
            await manager.stopInstance(node?.instance?.id);
        }),
        vscode.commands.registerCommand('openclawManager.restartInstance', async (node) => {
            await manager.restartInstance(node?.instance?.id);
        }),
        vscode.commands.registerCommand('openclawManager.cloneInstance', async (node) => {
            await manager.cloneInstance(node?.instance?.id);
        }),
        vscode.commands.registerCommand('openclawManager.openConfig', (node) => {
            manager.openConfig(node?.instance?.id);
        }),
        vscode.commands.registerCommand('openclawManager.viewLogs', (node) => {
            manager.viewLogs(node?.instance?.id);
        }),
        vscode.commands.registerCommand('openclawManager.healthCheck', async (node) => {
            await manager.healthCheck(node?.instance?.id);
        }),
    ];

    commands.forEach(cmd => context.subscriptions.push(cmd));
    context.subscriptions.push(treeView);

    // Auto-start instances if configured
    if (vscode.workspace.getConfiguration('openclawManager').get('autoStart')) {
        manager.startAllInstances();
    }
}

export function deactivate() {
    console.log('OpenClaw Manager deactivated');
}
