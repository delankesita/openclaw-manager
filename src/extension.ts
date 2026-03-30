import * as vscode from 'vscode';
import { OpenClawManager } from './manager/manager';
import { InstancesProvider } from './providers/instancesProvider';
import { DashboardPanel } from './webview/dashboardPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('OpenClaw Manager is now active');

    const manager = new OpenClawManager(context);
    const instancesProvider = new InstancesProvider(manager);

    // Register tree view
    const treeView = vscode.window.createTreeView('openclawInstances', {
        treeDataProvider: instancesProvider,
        showCollapseAll: true
    });

    // Register commands
    const commands = [
        vscode.commands.registerCommand('openclawManager.openDashboard', () => {
            DashboardPanel.createOrShow(context.extensionUri, manager);
        }),
        vscode.commands.registerCommand('openclawManager.createInstance', () => {
            manager.createInstance();
            instancesProvider.refresh();
        }),
        vscode.commands.registerCommand('openclawManager.deleteInstance', (node) => {
            manager.deleteInstance(node?.instance?.id);
            instancesProvider.refresh();
        }),
        vscode.commands.registerCommand('openclawManager.startInstance', (node) => {
            manager.startInstance(node?.instance?.id);
            instancesProvider.refresh();
        }),
        vscode.commands.registerCommand('openclawManager.stopInstance', (node) => {
            manager.stopInstance(node?.instance?.id);
            instancesProvider.refresh();
        }),
        vscode.commands.registerCommand('openclawManager.restartInstance', (node) => {
            manager.restartInstance(node?.instance?.id);
            instancesProvider.refresh();
        }),
        vscode.commands.registerCommand('openclawManager.cloneInstance', (node) => {
            manager.cloneInstance(node?.instance?.id);
            instancesProvider.refresh();
        }),
        vscode.commands.registerCommand('openclawManager.openConfig', (node) => {
            manager.openConfig(node?.instance?.id);
        }),
        vscode.commands.registerCommand('openclawManager.viewLogs', (node) => {
            manager.viewLogs(node?.instance?.id);
        }),
        vscode.commands.registerCommand('openclawManager.healthCheck', (node) => {
            manager.healthCheck(node?.instance?.id);
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
