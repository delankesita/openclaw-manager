import * as vscode from 'vscode';
import { OpenClawManager } from './manager/manager';
import { autoUpdateService } from './services/autoUpdate';

let manager: OpenClawManager;

export function activate(context: vscode.ExtensionContext) {
    console.log('OpenClaw Manager is now active');

    // Initialize manager
    manager = new OpenClawManager(context);

    // Start auto-update checker
    const UpdateService = autoUpdateService;
    const updateService = new UpdateService(context);
    updateService.startBackgroundCheck();

    // Register commands
    const commands = [
        // Dashboard
        vscode.commands.registerCommand('openclawManager.openDashboard', () => {
            manager.openDashboard();
        }),

        // Instance management
        vscode.commands.registerCommand('openclawManager.createInstance', () => {
            manager.createInstance();
        }),
        vscode.commands.registerCommand('openclawManager.createInstanceFromTemplate', () => {
            manager.showQuickSetup();
        }),
        vscode.commands.registerCommand('openclawManager.deleteInstance', () => {
            manager.deleteInstance();
        }),
        vscode.commands.registerCommand('openclawManager.startInstance', () => {
            manager.startInstance();
        }),
        vscode.commands.registerCommand('openclawManager.stopInstance', () => {
            manager.stopInstance();
        }),
        vscode.commands.registerCommand('openclawManager.restartInstance', () => {
            manager.restartInstance();
        }),
        vscode.commands.registerCommand('openclawManager.cloneInstance', () => {
            manager.cloneInstance();
        }),

        // Files
        vscode.commands.registerCommand('openclawManager.openConfig', () => {
            manager.openConfig();
        }),
        vscode.commands.registerCommand('openclawManager.viewLogs', () => {
            manager.viewLogs();
        }),

        // Health
        vscode.commands.registerCommand('openclawManager.healthCheck', () => {
            manager.healthCheck();
        }),

        // Backup
        vscode.commands.registerCommand('openclawManager.backupInstance', () => {
            manager.backupInstance();
        }),
        vscode.commands.registerCommand('openclawManager.restoreInstance', () => {
            manager.restoreInstance();
        }),

        // Bulk operations
        vscode.commands.registerCommand('openclawManager.startAllInstances', () => {
            manager.startAllInstances();
        }),
        vscode.commands.registerCommand('openclawManager.stopAllInstances', () => {
            manager.stopAllInstances();
        }),

        // Import/Export
        vscode.commands.registerCommand('openclawManager.exportAllInstances', () => {
            manager.exportAllInstances();
        }),
        vscode.commands.registerCommand('openclawManager.importInstances', () => {
            manager.importInstances();
        }),

        // Channel configuration
        vscode.commands.registerCommand('openclawManager.configureChannels', () => {
            manager.configureChannels();
        }),
        vscode.commands.registerCommand('openclawManager.addChannel', () => {
            manager.addChannel();
        }),

        // Model selection
        vscode.commands.registerCommand('openclawManager.selectModel', () => {
            manager.selectModel();
        }),
        vscode.commands.registerCommand('openclawManager.showModelConfig', () => {
            manager.showModelConfig();
        }),

        // Auto update
        vscode.commands.registerCommand('openclawManager.checkForUpdates', () => {
            manager.checkForUpdates();
        }),
        vscode.commands.registerCommand('openclawManager.installUpdate', () => {
            manager.installUpdate();
        })
    ];

    commands.forEach(cmd => context.subscriptions.push(cmd));

    // Register tree view
    const treeProvider = new InstanceTreeProvider(manager);
    const treeView = vscode.window.createTreeView('openclawInstances', {
        treeDataProvider: treeProvider,
        showCollapseAll: false
    });

    context.subscriptions.push(treeView);

    // Update tree when instances change
    manager.onDidChangeInstances(() => {
        treeProvider.refresh();
    });

    // Initialize status bar
    initStatusBar(context, manager);

    // Show welcome message on first install
    const hasShownWelcome = context.globalState.get<boolean>('hasShownWelcome');
    if (!hasShownWelcome) {
        showWelcomeMessage(context);
    }
}

function initStatusBar(context: vscode.ExtensionContext, manager: OpenClawManager) {
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );

    statusBarItem.command = 'openclawManager.openDashboard';
    statusBarItem.tooltip = 'OpenClaw Manager - Click to open dashboard';

    const updateStatusBar = () => {
        const instances = manager.getInstances();
        const running = instances.filter(i => i.status === 'running').length;
        const total = instances.length;

        statusBarItem.text = `$(server) OpenClaw: ${running}/${total}`;
        statusBarItem.show();
    };

    updateStatusBar();
    manager.onDidChangeInstances(updateStatusBar);

    context.subscriptions.push(statusBarItem);
}

async function showWelcomeMessage(context: vscode.ExtensionContext) {
    const action = await vscode.window.showInformationMessage(
        '🦐 OpenClaw Manager installed! Create your first instance?',
        'Quick Setup',
        'Open Dashboard',
        'Later'
    );

    switch (action) {
        case 'Quick Setup':
            vscode.commands.executeCommand('openclawManager.createInstanceFromTemplate');
            break;
        case 'Open Dashboard':
            vscode.commands.executeCommand('openclawManager.openDashboard');
            break;
    }

    context.globalState.update('hasShownWelcome', true);
}

class InstanceTreeProvider implements vscode.TreeDataProvider<InstanceItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<InstanceItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private manager: OpenClawManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: InstanceItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: InstanceItem): Thenable<InstanceItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        const instances = this.manager.getInstances();
        return Promise.resolve(
            instances.map(
                i => new InstanceItem(i.name, i.status, i.id, i.port, i.model)
            )
        );
    }
}

class InstanceItem extends vscode.TreeItem {
    constructor(
        public readonly name: string,
        public readonly status: string,
        public readonly id: string,
        public readonly port: number,
        public readonly model?: string
    ) {
        super(name, vscode.TreeItemCollapsibleState.None);

        const statusIcon = {
            running: '🟢',
            stopped: '🔴',
            starting: '🟡',
            stopping: '🟡',
            error: '❌'
        }[status] || '⚪';

        this.label = `${statusIcon} ${name}`;
        this.description = `Port ${port}${model ? ` | ${model}` : ''}`;
        this.tooltip = `${name} - ${status}${model ? `\nModel: ${model}` : ''}`;
        this.contextValue = status;

        this.command = {
            command: 'openclawManager.openDashboard',
            title: 'Open Dashboard'
        };
    }
}

export function deactivate() {
    if (manager) {
        manager.dispose();
    }
}
