import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import { Instance, InstanceStatus, InstanceCreateOptions, InstanceHealth, InstanceConfig } from '../models/instance';
import { getTemplate } from '../templates/templates';
import { logger } from '../services/logger';
import { notification } from '../services/notification';
import { backupService } from '../services/backup';
import { importExportService } from '../services/importExport';
import { channelConfigService, ChannelConfig } from '../services/channelConfig';
import { modelSelectorService, Model } from '../services/modelSelector';
import { autoUpdateService } from '../services/autoUpdate';

const execAsync = promisify(exec);

export class OpenClawManager {
    private context: vscode.ExtensionContext;
    private instances: Map<string, Instance> = new Map();
    private processes: Map<string, ChildProcess> = new Map();
    private instancesDir: string;
    private healthCheckInterval?: NodeJS.Timeout;
    private _onDidChangeInstances = new vscode.EventEmitter<void>();
    readonly onDidChangeInstances = this._onDidChangeInstances.event;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.instancesDir = vscode.workspace.getConfiguration('openclawManager')
            .get('instancesDir', '~/.openclaw-instances')
            .replace('~', os.homedir());
        
        this.ensureInstancesDir();
        this.loadInstances();
        this.startHealthCheck();
        this.detectRunningInstances();
        
        logger.info('OpenClaw Manager initialized');
    }

    private ensureInstancesDir(): void {
        if (!fs.existsSync(this.instancesDir)) {
            fs.mkdirSync(this.instancesDir, { recursive: true });
        }
    }

    private loadInstances(): void {
        const configFile = path.join(this.instancesDir, 'instances.json');
        if (fs.existsSync(configFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
                Object.entries(data).forEach(([id, config]) => {
                    this.instances.set(id, {
                        ...(config as Instance),
                        status: InstanceStatus.Stopped
                    });
                });
                logger.info(`Loaded ${this.instances.size} instances`);
            } catch (err) {
                logger.error('Failed to load instances', err);
            }
        }
    }

    private saveInstances(): void {
        const configFile = path.join(this.instancesDir, 'instances.json');
        const data: Record<string, unknown> = {};
        this.instances.forEach((instance, id) => {
            const { status, health, pid, ...config } = instance;
            data[id] = config;
        });
        fs.writeFileSync(configFile, JSON.stringify(data, null, 2));
        this._onDidChangeInstances.fire();
    }

    private async detectRunningInstances(): Promise<void> {
        try {
            const { stdout } = await execAsync('ps aux | grep -E "openclaw|claw" | grep -v grep');
            const lines = stdout.split('\n').filter(Boolean);
            
            for (const instance of this.instances.values()) {
                if (lines.some(line => line.includes(instance.stateDir))) {
                    instance.status = InstanceStatus.Running;
                }
            }
        } catch {
            // No running instances found
        }
    }

    async createInstance(options?: InstanceCreateOptions): Promise<string | undefined> {
        const name = options?.name || await vscode.window.showInputBox({
            prompt: 'Instance name',
            placeHolder: 'my-shrimp',
            value: `shrimp-${Date.now()}`
        });

        if (!name) {
            return;
        }

        const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const defaultPort = vscode.workspace.getConfiguration('openclawManager').get('defaultPort', 5000);
        const port = options?.port || await this.findAvailablePort(defaultPort);

        const instanceDir = path.join(this.instancesDir, id);
        const stateDir = path.join(instanceDir, 'state');

        fs.mkdirSync(stateDir, { recursive: true });

        // Clone from existing instance if specified
        if (options?.cloneFrom) {
            const sourceDir = path.join(this.instancesDir, options.cloneFrom, 'state');
            if (fs.existsSync(sourceDir)) {
                fs.cpSync(sourceDir, stateDir, { recursive: true });
                logger.info(`Cloned instance from ${options.cloneFrom}`);
            }
        } else {
            // Create default config
            const configPath = path.join(stateDir, 'openclaw.json');
            const defaultConfig = {
                gateway: {
                    port,
                    mode: 'local',
                    bind: 'loopback'
                },
                agents: {
                    list: [{ id: 'main', model: options?.model || 'default' }]
                }
            };
            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        }

        const instance: Instance = {
            id,
            name,
            port,
            stateDir,
            model: options?.model,
            status: InstanceStatus.Stopped,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.instances.set(id, instance);
        this.saveInstances();

        await notification.info(`Created OpenClaw instance: ${name}`);
        logger.info(`Created instance: ${name}`, { id, port });
        return id;
    }

    async createInstanceFromTemplate(
        templateId: string,
        name: string,
        port: number,
        options?: { model?: string; channels?: string[] }
    ): Promise<string | undefined> {
        const template = getTemplate(templateId);
        if (!template) {
            await notification.error(`Template not found: ${templateId}`);
            return;
        }

        const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const instanceDir = path.join(this.instancesDir, id);
        const stateDir = path.join(instanceDir, 'state');

        fs.mkdirSync(stateDir, { recursive: true });

        // Apply template config
        const config: Record<string, unknown> = {
            gateway: {
                port,
                ...template.config.gateway
            },
            ...template.config
        };

        if (options?.model) {
            config.agents = config.agents || {};
            (config.agents as Record<string, unknown>).list = [
                { id: 'main', model: options.model }
            ];
        }

        const configPath = path.join(stateDir, 'openclaw.json');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        const instance: Instance = {
            id,
            name,
            port,
            stateDir,
            model: options?.model,
            channels: options?.channels?.reduce((acc, ch) => {
                acc[ch] = { enabled: true };
                return acc;
            }, {} as Record<string, unknown>) as Record<string, unknown>,
            status: InstanceStatus.Stopped,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.instances.set(id, instance);
        this.saveInstances();

        await notification.info(`Created ${template.name}: ${name}`);
        logger.info(`Created instance from template: ${templateId}`, { id, name, port });
        return id;
    }

    async deleteInstance(id?: string): Promise<void> {
        if (!id) {
            const names = Array.from(this.instances.values()).map(i => ({
                label: i.name,
                id: i.id
            }));
            const selected = await vscode.window.showQuickPick(names);
            if (!selected) return;
            id = selected.id;
        }

        const instance = this.instances.get(id);
        if (!instance) {
            await notification.error(`Instance ${id} not found`);
            return;
        }

        // Offer backup before delete
        const backup = await vscode.window.showInformationMessage(
            `Delete instance "${instance.name}"?`,
            'Delete with Backup',
            'Delete',
            'Cancel'
        );

        if (backup === 'Cancel' || !backup) {
            return;
        }

        if (backup === 'Delete with Backup') {
            await backupService.createBackup(
                instance.id,
                instance.name,
                instance.stateDir,
                'Pre-delete backup'
            );
        }

        // Stop instance first
        await this.stopInstanceInternal(id);

        // Remove directory
        const instanceDir = path.join(this.instancesDir, id);
        fs.rmSync(instanceDir, { recursive: true, force: true });

        this.instances.delete(id);
        this.saveInstances();

        await notification.info(`Deleted instance: ${instance.name}`);
        logger.info(`Deleted instance: ${instance.name}`, { id });
    }

    async startInstance(id?: string): Promise<void> {
        if (!id) {
            const names = Array.from(this.instances.values())
                .filter(i => i.status === InstanceStatus.Stopped)
                .map(i => ({ label: i.name, id: i.id }));
            const selected = await vscode.window.showQuickPick(names);
            if (!selected) return;
            id = selected.id;
        }

        const instance = this.instances.get(id);
        if (!instance) {
            await notification.error(`Instance ${id} not found`);
            return;
        }

        if (instance.status === InstanceStatus.Running) {
            await notification.warning(`Instance ${instance.name} is already running`);
            return;
        }

        instance.status = InstanceStatus.Starting;
        this._onDidChangeInstances.fire();

        try {
            const childProcess = spawn('openclaw', ['gateway', 'start'], {
                cwd: instance.stateDir,
                env: { ...process.env, OPENCLAW_STATE_DIR: instance.stateDir },
                detached: true,
                stdio: 'ignore'
            });

            childProcess.unref();
            this.processes.set(id, childProcess);

            // Wait for gateway to be ready
            await this.waitForGateway(instance.port);

            instance.status = InstanceStatus.Running;
            instance.pid = process.pid;
            instance.updatedAt = new Date();

            await notification.info(`Started instance: ${instance.name}`);
            logger.info(`Started instance: ${instance.name}`, { id, port: instance.port });
        } catch (err) {
            instance.status = InstanceStatus.Error;
            await notification.error(`Failed to start ${instance.name}: ${err}`);
            logger.error(`Failed to start instance: ${instance.name}`, err);
        }

        this._onDidChangeInstances.fire();
    }

    async stopInstance(id?: string): Promise<void> {
        if (!id) {
            const names = Array.from(this.instances.values())
                .filter(i => i.status === InstanceStatus.Running)
                .map(i => ({ label: i.name, id: i.id }));
            const selected = await vscode.window.showQuickPick(names);
            if (!selected) return;
            id = selected.id;
        }

        await this.stopInstanceInternal(id);
        const instance = this.instances.get(id);
        if (instance) {
            await notification.info(`Stopped instance: ${instance.name}`);
        }
    }

    private async stopInstanceInternal(id: string): Promise<void> {
        const instance = this.instances.get(id);
        if (!instance || instance.status === InstanceStatus.Stopped) {
            return;
        }

        instance.status = InstanceStatus.Stopping;
        this._onDidChangeInstances.fire();

        try {
            const childProc = this.processes.get(id);
            if (childProc) {
                childProc.kill('SIGTERM');
                this.processes.delete(id);
            }

            // Also try to stop via CLI
            await execAsync('openclaw gateway stop', {
                cwd: instance.stateDir,
                env: { ...process.env, OPENCLAW_STATE_DIR: instance.stateDir }
            }).catch(() => {}); // Ignore errors
        } catch (err) {
            logger.error('Stop error:', err);
        }

        instance.status = InstanceStatus.Stopped;
        instance.pid = undefined;
        instance.updatedAt = new Date();
        this._onDidChangeInstances.fire();
    }

    async restartInstance(id?: string): Promise<void> {
        if (!id) {
            const names = Array.from(this.instances.values())
                .filter(i => i.status === InstanceStatus.Running)
                .map(i => ({ label: i.name, id: i.id }));
            const selected = await vscode.window.showQuickPick(names);
            if (!selected) return;
            id = selected.id;
        }

        await notification.progress('Restarting instance...', async () => {
            await this.stopInstanceInternal(id);
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.startInstance(id);
        });
    }

    async cloneInstance(id?: string): Promise<string | undefined> {
        if (!id) {
            const names = Array.from(this.instances.values()).map(i => ({
                label: i.name,
                id: i.id
            }));
            const selected = await vscode.window.showQuickPick(names);
            if (!selected) return;
            id = selected.id;
        }

        const source = this.instances.get(id);
        if (!source) {
            await notification.error(`Instance ${id} not found`);
            return;
        }

        const name = await vscode.window.showInputBox({
            prompt: 'New instance name',
            placeHolder: `${source.name}-clone`
        });

        if (!name) return;

        return this.createInstance({
            name,
            cloneFrom: id
        });
    }

    openConfig(id?: string): void {
        if (!id) return;

        const instance = this.instances.get(id);
        if (!instance) return;

        const configPath = path.join(instance.stateDir, 'openclaw.json');
        if (fs.existsSync(configPath)) {
            const uri = vscode.Uri.file(configPath);
            vscode.window.showTextDocument(uri);
        } else {
            notification.error('Config file not found');
        }
    }

    viewLogs(id?: string): void {
        if (!id) return;

        const instance = this.instances.get(id);
        if (!instance) return;

        const logDir = path.join(instance.stateDir, 'logs');
        
        if (fs.existsSync(logDir)) {
            const logFiles = fs.readdirSync(logDir).filter(f => f.endsWith('.log'));
            if (logFiles.length > 0) {
                const logPath = path.join(logDir, logFiles[0]);
                const uri = vscode.Uri.file(logPath);
                vscode.window.showTextDocument(uri, { preview: false });
                return;
            }
        }

        // Create terminal for logs
        const terminal = vscode.window.createTerminal(`OpenClaw: ${instance.name}`);
        terminal.sendText(`tail -f ${instance.stateDir}/logs/*.log 2>/dev/null || echo "No logs found"`);
        terminal.show();
    }

    async healthCheck(id?: string): Promise<InstanceHealth | undefined> {
        if (!id) return;

        const instance = this.instances.get(id);
        if (!instance) return;

        try {
            const response = await axios.get(`http://localhost:${instance.port}/health`, {
                timeout: 5000
            });

            instance.health = {
                status: 'ok',
                cpu: response.data.cpu || 0,
                memory: response.data.memory || 0,
                uptime: response.data.uptime || 0,
                lastCheck: new Date()
            };
        } catch (err) {
            instance.health = {
                status: 'error',
                cpu: 0,
                memory: 0,
                uptime: 0,
                lastCheck: new Date(),
                message: instance.status === InstanceStatus.Running ? 'Connection failed' : 'Instance not running'
            };
        }

        this._onDidChangeInstances.fire();
        return instance.health;
    }

    async backupInstance(id?: string): Promise<void> {
        if (!id) {
            const names = Array.from(this.instances.values()).map(i => ({
                label: i.name,
                id: i.id
            }));
            const selected = await vscode.window.showQuickPick(names);
            if (!selected) return;
            id = selected.id;
        }

        const instance = this.instances.get(id);
        if (!instance) return;

        const description = await vscode.window.showInputBox({
            prompt: 'Backup description (optional)',
            placeHolder: 'Before major changes'
        });

        await backupService.createBackup(
            instance.id,
            instance.name,
            instance.stateDir,
            description
        );

        await notification.info(`Backup created for ${instance.name}`);
    }

    async restoreInstance(id?: string): Promise<void> {
        if (!id) {
            await notification.error('Instance ID required');
            return;
        }

        const backups = backupService.getBackupsForInstance(id);
        if (backups.length === 0) {
            await notification.warning('No backups found for this instance');
            return;
        }

        const selected = await vscode.window.showQuickPick(
            backups.map(b => ({
                label: `${b.instanceName} - ${b.createdAt.toLocaleString()}`,
                description: backupService.formatSize(b.size),
                id: b.id
            })),
            { placeHolder: 'Select backup to restore' }
        );

        if (!selected) return;

        const instance = this.instances.get(id);
        if (!instance) return;

        // Stop instance first
        await this.stopInstanceInternal(id);

        // Restore
        await backupService.restoreBackup(selected.id, instance.stateDir);

        await notification.info(`Restored ${instance.name} from backup`);
    }

    getInstances(): Instance[] {
        return Array.from(this.instances.values());
    }

    getInstance(id: string): Instance | undefined {
        return this.instances.get(id);
    }

    async startAllInstances(): Promise<void> {
        for (const instance of this.instances.values()) {
            if (instance.autoStart && instance.status === InstanceStatus.Stopped) {
                await this.startInstance(instance.id);
            }
        }
    }

    async stopAllInstances(): Promise<void> {
        for (const instance of this.instances.values()) {
            if (instance.status === InstanceStatus.Running) {
                await this.stopInstanceInternal(instance.id);
            }
        }
    }

    async exportAllInstances(): Promise<void> {
        const configs = Array.from(this.instances.values()).map(i => {
            const { status, health, pid, ...config } = i;
            return config;
        });

        await importExportService.exportInstances(configs);
    }

    async importInstances(): Promise<number> {
        const configs = await importExportService.importInstances();
        let imported = 0;

        for (const config of configs) {
            const instance: Instance = {
                ...config,
                status: InstanceStatus.Stopped,
                createdAt: config.createdAt || new Date(),
                updatedAt: new Date()
            };

            this.instances.set(instance.id, instance);
            imported++;
        }

        this.saveInstances();
        await notification.info(`Imported ${imported} instances`);
        return imported;
    }

    private async findAvailablePort(startPort: number): Promise<number> {
        const usedPorts = new Set(Array.from(this.instances.values()).map(i => i.port));
        let port = startPort;
        while (usedPorts.has(port)) {
            port++;
        }
        return port;
    }

    private async waitForGateway(port: number, timeout = 30000): Promise<void> {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            try {
                await axios.get(`http://localhost:${port}/health`, { timeout: 1000 });
                return;
            } catch {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        throw new Error('Gateway did not start within timeout');
    }

    private startHealthCheck(): void {
        this.healthCheckInterval = setInterval(() => {
            this.instances.forEach(async (instance, id) => {
                if (instance.status === InstanceStatus.Running) {
                    await this.healthCheck(id);
                }
            });
        }, 30000);
    }

    openDashboard(): void {
        const { OpenClawDashboard } = require('./dashboard');
        const dashboard = new OpenClawDashboard(this);
        dashboard.show();
    }

    async showQuickSetup(): Promise<string | undefined> {
        const { quickSetupService } = require('../services/quickSetup');
        const result = await quickSetupService.showQuickSetup();
        if (!result) {
            return;
        }

        return this.createInstanceFromTemplate(
            result.templateId,
            result.instanceName,
            result.port,
            { model: result.model, channels: result.channels }
        );
    }

    // Channel configuration
    async configureChannels(instanceId?: string): Promise<void> {
        if (!instanceId) {
            const names = Array.from(this.instances.values()).map(i => ({
                label: i.name,
                id: i.id
            }));
            const selected = await vscode.window.showQuickPick(names, {
                placeHolder: 'Select instance to configure channels'
            });
            if (!selected) return;
            instanceId = selected.id;
        }

        const instance = this.instances.get(instanceId);
        if (!instance) {
            await notification.error('Instance not found');
            return;
        }

        const config = await channelConfigService.showChannelConfig(instance);
        if (!config) return;

        instance.channels = config;
        instance.updatedAt = new Date();
        this.saveInstances();

        await notification.info(`Updated channels for ${instance.name}`);
    }

    async addChannel(instanceId?: string): Promise<void> {
        if (!instanceId) {
            const names = Array.from(this.instances.values()).map(i => ({
                label: i.name,
                id: i.id
            }));
            const selected = await vscode.window.showQuickPick(names);
            if (!selected) return;
            instanceId = selected.id;
        }

        const instance = this.instances.get(instanceId);
        if (!instance) return;

        const result = await channelConfigService.quickAddChannel(instance);
        if (!result) return;

        instance.channels = instance.channels || {};
        instance.channels[result.type] = result.config;
        instance.updatedAt = new Date();
        this.saveInstances();

        await notification.info(`Added ${result.type} channel to ${instance.name}`);
    }

    // Model selection
    async selectModel(instanceId?: string): Promise<void> {
        if (!instanceId) {
            const names = Array.from(this.instances.values()).map(i => ({
                label: i.name,
                description: i.model || 'default',
                id: i.id
            }));
            const selected = await vscode.window.showQuickPick(names, {
                placeHolder: 'Select instance to change model'
            });
            if (!selected) return;
            instanceId = selected.id;
        }

        const instance = this.instances.get(instanceId);
        if (!instance) return;

        const model = await modelSelectorService.showModelSelector(instance.model);
        if (!model) return;

        instance.model = model.id;
        instance.updatedAt = new Date();
        this.saveInstances();

        await notification.info(`Set model to ${model.name} for ${instance.name}`);
    }

    async showModelConfig(): Promise<void> {
        await modelSelectorService.showModelConfig();
    }

    // Auto update
    async checkForUpdates(): Promise<void> {
        const UpdateService = autoUpdateService;
        const updateService = new UpdateService(this.context);
        const release = await updateService.checkForUpdate(true);

        if (release) {
            await updateService.showUpdateDialog(release);
        }
    }

    async installUpdate(): Promise<void> {
        const UpdateService = autoUpdateService;
        const updateService = new UpdateService(this.context);
        const release = await updateService.checkForUpdate(false);

        if (release) {
            await updateService.downloadAndInstall(release);
        }
    }

    dispose(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        this.processes.forEach((process) => {
            process.kill('SIGTERM');
        });
        logger.dispose();
    }
}
