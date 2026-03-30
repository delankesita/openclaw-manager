import * as vscode from 'vscode';
import { OpenClawManager } from './manager/manager';
import { InstancesProvider } from './providers/instancesProvider';
import { DashboardPanel } from './webview/dashboardPanel';
import { StatusBarService } from './services/statusBar';

interface TreeNode {
    instance?: { id: string };
}

export function activate(context: vscode.ExtensionContext) {
    console.log('OpenClaw Manager is now active');

    const manager = new OpenClawManager();
    const instancesProvider = new InstancesProvider(manager);
    const statusBar = new StatusBarService(manager);

    context.subscriptions.push(manager, statusBar);

    // Tree View
    const treeView = vscode.window.createTreeView('openclawInstances', {
        treeDataProvider: instancesProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);

    manager.onChanged(() => {
        instancesProvider.refresh();
        DashboardPanel.currentPanel?.update();
    });

    // Register commands
    const commands: [string, (node?: TreeNode) => void | Promise<void>][] = [
        // Dashboard
        ['openclawManager.openDashboard', () => DashboardPanel.createOrShow(context.extensionUri, manager)],

        // Instance CRUD
        ['openclawManager.create', () => manager.create()],
        ['openclawManager.delete', (node) => manager.delete(node?.instance?.id)],
        ['openclawManager.clone', (node) => manager.clone(node?.instance?.id)],

        // Process control
        ['openclawManager.start', (node) => manager.start(node?.instance?.id)],
        ['openclawManager.stop', (node) => manager.stop(node?.instance?.id)],
        ['openclawManager.restart', (node) => manager.restart(node?.instance?.id)],
        ['openclawManager.startAll', () => manager.startAll()],
        ['openclawManager.stopAll', () => manager.stopAll()],

        // Configuration
        ['openclawManager.openConfig', (node) => manager.openConfig(node?.instance?.id)],
        ['openclawManager.viewLogs', (node) => manager.viewLogs(node?.instance?.id)],
        ['openclawManager.configureChannels', (node) => manager.configureChannels(node?.instance?.id)],
        ['openclawManager.selectModel', (node) => manager.selectModel(node?.instance?.id)],

        // Health
        ['openclawManager.healthCheck', (node) => manager.healthCheck(node?.instance?.id)],

        // Backup
        ['openclawManager.backup', (node) => manager.backup(node?.instance?.id)],
        ['openclawManager.restore', (node) => manager.restore(node?.instance?.id)],

        // Import/Export
        ['openclawManager.exportAll', () => manager.exportAll()],
        ['openclawManager.import', () => manager.import()]
    ];

    commands.forEach(([command, handler]) => {
        context.subscriptions.push(
            vscode.commands.registerCommand(command, handler)
        );
    });

    // Auto-start instances
    if (vscode.workspace.getConfiguration('openclawManager').get('autoStart')) {
        manager.startAll();
    }

    // Welcome message on first install
    if (!context.globalState.get('hasShownWelcome')) {
        showWelcome(context, manager);
    }
}

async function showWelcome(context: vscode.ExtensionContext, manager: OpenClawManager): Promise<void> {
    const action = await vscode.window.showInformationMessage(
        '🦞 OpenClaw Manager installed! Create your first instance?',
        'Create Instance',
        'Open Dashboard',
        'Later'
    );

    switch (action) {
        case 'Create Instance':
            manager.create();
            break;
        case 'Open Dashboard':
            vscode.commands.executeCommand('openclawManager.openDashboard');
            break;
    }

    context.globalState.update('hasShownWelcome', true);
}

export function deactivate() {
    console.log('OpenClaw Manager deactivated');
}
