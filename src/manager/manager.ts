import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Instance, InstanceStatus, InstanceHealth, InstanceConfig, InstanceTemplate, ChannelConfig } from '../models/instance';
import { configService } from '../services/configService';
import { processService } from '../services/processService';
import { util } from '../services/util';
import { templates, getTemplate } from '../templates/templates';

export class OpenClawManager implements vscode.Disposable {
    private _onChanged = new vscode.EventEmitter<void>();
    readonly onChanged = this._onChanged.event;

    private healthCheckInterval?: NodeJS.Timeout;

    constructor() {
        processService.onProcessChanged((id) => {
            this._onChanged.fire();
        });

        this.startHealthCheck();
    }

    // ==================== Instance Management ====================

    async create(options?: { name?: string; port?: number; template?: string; model?: string }): Promise<string | undefined> {
        // Step 1: Get or select template
        let templateId = options?.template;
        if (!templateId) {
            const items = templates.map(t => ({
                label: `${t.icon} ${t.name}`,
                description: t.description,
                id: t.id
            }));
            const selected = await util.pick(items, { placeHolder: 'Select template' });
            if (!selected) return;
            templateId = selected.id;
        }

        const template = getTemplate(templateId);
        if (!template) return;

        // Step 2: Get instance name
        const name = options?.name || await util.input('Instance name', {
            placeholder: 'my-shrimp',
            value: `shrimp-${Date.now()}`
        });
        if (!name) return;

        const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

        // Step 3: Get port
        const usedPorts = new Set(configService.getInstances().map(i => i.port));
        const port = options?.port || await processService.findAvailablePort(5000, usedPorts);

        // Step 4: Get model (optional)
        let model = options?.model;
        if (!model) {
            const modelItems = [
                { label: 'Default', id: '' },
                { label: '⭐ MiniMax M2.5 (Fast)', id: 'nvidia/minimaxai/minimax-m2.5' },
                { label: 'DeepSeek V3', id: 'nvidia/deepseek-ai/deepseek-v3' },
                { label: 'Qwen 3 30B', id: 'nvidia/qwen/qwen3-30b-a3b' },
                { label: 'Custom...', id: 'custom' }
            ];
            const selected = await util.pick(modelItems, { placeHolder: 'Select model (optional)' });
            if (selected?.id === 'custom') {
                model = await util.input('Enter model ID');
            } else if (selected?.id) {
                model = selected.id;
            }
        }

        // Create instance directory
        const stateDir = configService.getInstanceStateDir(id);
        fs.mkdirSync(stateDir, { recursive: true });

        // Generate openclaw.json from template
        const openclawConfig = this.generateConfig(template, port, model);
        configService.writeOpenClawConfig(stateDir, openclawConfig);

        // Create instance record
        const instance = configService.createInstance({
            id,
            name,
            port,
            stateDir,
            model,
            channels: {},
            createdAt: new Date(),
            updatedAt: new Date()
        });

        this._onChanged.fire();
        await util.notify(`Created instance: ${name}`);

        return id;
    }

    async delete(id?: string): Promise<void> {
        if (!id) {
            const items = configService.getInstances().map(i => ({ label: i.name, id: i.id }));
            const selected = await util.pick(items, { placeHolder: 'Select instance to delete' });
            if (!selected) return;
            id = selected.id;
        }

        const instance = configService.getInstance(id);
        if (!instance) return;

        const confirm = await util.warnDialog(
            `Delete "${instance.name}"?`,
            'Delete with Backup',
            'Delete',
            'Cancel'
        );

        if (!confirm || confirm === 'Cancel') return;

        if (confirm === 'Delete with Backup') {
            await this.backup(id);
        }

        // Stop instance first
        if (instance.status === InstanceStatus.Running) {
            await processService.stop(instance);
        }

        // Delete files
        const instanceDir = path.dirname(instance.stateDir);
        if (fs.existsSync(instanceDir)) {
            fs.rmSync(instanceDir, { recursive: true, force: true });
        }

        // Delete from config
        configService.deleteInstance(id);
        this._onChanged.fire();

        await util.notify(`Deleted instance: ${instance.name}`);
    }

    async clone(id?: string): Promise<string | undefined> {
        if (!id) {
            const items = configService.getInstances().map(i => ({ label: i.name, id: i.id }));
            const selected = await util.pick(items, { placeHolder: 'Select instance to clone' });
            if (!selected) return;
            id = selected.id;
        }

        const source = configService.getInstance(id);
        if (!source) return;

        const name = await util.input('New instance name', {
            placeholder: `${source.name}-clone`
        });
        if (!name) return;

        const newId = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const usedPorts = new Set(configService.getInstances().map(i => i.port));
        const port = await processService.findAvailablePort(source.port + 1, usedPorts);

        const stateDir = configService.getInstanceStateDir(newId);
        fs.mkdirSync(stateDir, { recursive: true });

        // Copy state directory
        if (fs.existsSync(source.stateDir)) {
            fs.cpSync(source.stateDir, stateDir, { recursive: true });
        }

        // Update port in copied config
        const config = configService.readOpenClawConfig(stateDir);
        if (config) {
            (config.gateway as Record<string, unknown>).port = port;
            configService.writeOpenClawConfig(stateDir, config);
        }

        const instance = configService.createInstance({
            id: newId,
            name,
            port,
            stateDir,
            model: source.model,
            channels: { ...source.channels },
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Copy secrets
        const secrets = configService.getSecrets(id);
        Object.entries(secrets).forEach(([key, value]) => {
            configService.setSecret(newId, key, value);
        });

        this._onChanged.fire();
        await util.notify(`Cloned instance: ${name}`);

        return newId;
    }

    // ==================== Process Control ====================

    async start(id?: string): Promise<void> {
        if (!id) {
            const items = configService.getInstances()
                .filter(i => i.status === InstanceStatus.Stopped)
                .map(i => ({ label: i.name, id: i.id }));
            const selected = await util.pick(items, { placeHolder: 'Select instance to start' });
            if (!selected) return;
            id = selected.id;
        }

        const instance = configService.getInstance(id);
        if (!instance) return;

        try {
            await util.withProgress(`Starting ${instance.name}...`, () => processService.start(instance));
            await util.notify(`Started ${instance.name}`);
        } catch (err) {
            await util.error(`Failed to start ${instance.name}: ${err}`);
        }
    }

    async stop(id?: string): Promise<void> {
        if (!id) {
            const items = configService.getInstances()
                .filter(i => i.status === InstanceStatus.Running)
                .map(i => ({ label: i.name, id: i.id }));
            const selected = await util.pick(items, { placeHolder: 'Select instance to stop' });
            if (!selected) return;
            id = selected.id;
        }

        const instance = configService.getInstance(id);
        if (!instance) return;

        try {
            await util.withProgress(`Stopping ${instance.name}...`, () => processService.stop(instance));
            await util.notify(`Stopped ${instance.name}`);
        } catch (err) {
            await util.error(`Failed to stop ${instance.name}: ${err}`);
        }
    }

    async restart(id?: string): Promise<void> {
        if (!id) {
            const items = configService.getInstances()
                .filter(i => i.status === InstanceStatus.Running)
                .map(i => ({ label: i.name, id: i.id }));
            const selected = await util.pick(items, { placeHolder: 'Select instance to restart' });
            if (!selected) return;
            id = selected.id;
        }

        const instance = configService.getInstance(id);
        if (!instance) return;

        try {
            await util.withProgress(`Restarting ${instance.name}...`, () => processService.restart(instance));
            await util.notify(`Restarted ${instance.name}`);
        } catch (err) {
            await util.error(`Failed to restart ${instance.name}: ${err}`);
        }
    }

    async startAll(): Promise<void> {
        const instances = configService.getInstances().filter(i => i.autoStart);
        for (const instance of instances) {
            if (instance.status === InstanceStatus.Stopped) {
                await this.start(instance.id);
            }
        }
    }

    async stopAll(): Promise<void> {
        const instances = configService.getInstances().filter(i => i.status === InstanceStatus.Running);
        for (const instance of instances) {
            await this.stop(instance.id);
        }
    }

    // ==================== Configuration ====================

    openConfig(id?: string): void {
        if (!id) return;
        const instance = configService.getInstance(id);
        if (!instance) return;

        const configPath = path.join(instance.stateDir, 'openclaw.json');
        if (fs.existsSync(configPath)) {
            vscode.window.showTextDocument(vscode.Uri.file(configPath));
        }
    }

    viewLogs(id?: string): void {
        if (!id) return;
        const instance = configService.getInstance(id);
        if (!instance) return;

        const logDir = path.join(instance.stateDir, 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const terminal = vscode.window.createTerminal(`Logs: ${instance.name}`);
        terminal.sendText(`cd "${logDir}" && ls -la && echo "--- Use 'tail -f *.log' to follow logs ---"`);
        terminal.show();
    }

    async configureChannels(id?: string): Promise<void> {
        if (!id) {
            const items = configService.getInstances().map(i => ({ label: i.name, id: i.id }));
            const selected = await util.pick(items, { placeHolder: 'Select instance' });
            if (!selected) return;
            id = selected.id;
        }

        const instance = configService.getInstance(id);
        if (!instance) return;

        const channelTypes = [
            { label: '📱 Feishu', id: 'feishu' },
            { label: '🔔 DingTalk', id: 'dingtalk' },
            { label: '💬 WeCom', id: 'wecom' },
            { label: '🎮 Discord', id: 'discord' },
            { label: '💼 Slack', id: 'slack' }
        ];

        const selected = await util.pick(channelTypes, { placeHolder: 'Select channel to configure' });
        if (!selected) return;

        await this.configureChannel(id, selected.id);
    }

    private async configureChannel(instanceId: string, channelType: string): Promise<void> {
        const fields: Record<string, { key: string; label: string; secret: boolean }[]> = {
            feishu: [
                { key: 'appId', label: 'App ID', secret: false },
                { key: 'appSecret', label: 'App Secret', secret: true }
            ],
            dingtalk: [
                { key: 'clientId', label: 'Client ID', secret: false },
                { key: 'clientSecret', label: 'Client Secret', secret: true }
            ],
            wecom: [
                { key: 'corpId', label: 'Corp ID', secret: false },
                { key: 'agentId', label: 'Agent ID', secret: false },
                { key: 'secret', label: 'Secret', secret: true }
            ],
            discord: [
                { key: 'botToken', label: 'Bot Token', secret: true }
            ],
            slack: [
                { key: 'botToken', label: 'Bot Token', secret: true },
                { key: 'appToken', label: 'App Token', secret: true }
            ]
        };

        const channelFields = fields[channelType];
        if (!channelFields) return;

        const config: ChannelConfig = { enabled: true };

        for (const field of channelFields) {
            const value = await util.input(`Enter ${field.label}`, { password: field.secret });
            if (!value) return;
            (config as Record<string, unknown>)[field.key] = value;
        }

        configService.updateChannelConfig(instanceId, channelType, config);
        await util.notify(`Configured ${channelType} channel`);
    }

    async selectModel(id?: string): Promise<void> {
        if (!id) {
            const items = configService.getInstances().map(i => ({
                label: i.name,
                description: i.model || 'default',
                id: i.id
            }));
            const selected = await util.pick(items, { placeHolder: 'Select instance' });
            if (!selected) return;
            id = selected.id;
        }

        const instance = configService.getInstance(id);
        if (!instance) return;

        const models = [
            { label: 'Default', id: '' },
            { label: '⭐ MiniMax M2.5 (Fast)', id: 'nvidia/minimaxai/minimax-m2.5' },
            { label: 'DeepSeek V3', id: 'nvidia/deepseek-ai/deepseek-v3' },
            { label: 'Qwen 3 30B', id: 'nvidia/qwen/qwen3-30b-a3b' },
            { label: 'Llama 3.3 70B', id: 'nvidia/meta/llama-3.3-70b-instruct' },
            { label: 'Custom...', id: 'custom' }
        ];

        const selected = await util.pick(models, { placeHolder: 'Select model' });
        if (!selected) return;

        let model = selected.id;
        if (model === 'custom') {
            model = await util.input('Enter model ID') || '';
        }

        if (model !== undefined) {
            configService.updateModelConfig(id, model);
            await util.notify(`Updated model for ${instance.name}`);
        }
    }

    // ==================== Backup & Restore ====================

    async backup(id?: string): Promise<void> {
        if (!id) {
            const items = configService.getInstances().map(i => ({ label: i.name, id: i.id }));
            const selected = await util.pick(items, { placeHolder: 'Select instance to backup' });
            if (!selected) return;
            id = selected.id;
        }

        const instance = configService.getInstance(id);
        if (!instance) return;

        // Ask whether to include secrets
        const includeSecrets = await util.confirm(
            'Include credentials (API keys, tokens) in backup?',
            'Include credentials'
        );

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `${instance.name}-${timestamp}.json`;
        
        const config = configService.readOpenClawConfig(instance.stateDir);
        const secrets = includeSecrets ? configService.getSecrets(id) : {};
        
        const backupData = {
            version: '1.0',
            instance: {
                id: instance.id,
                name: instance.name,
                port: instance.port,
                model: instance.model,
                channels: instance.channels
            },
            config,
            secrets: includeSecrets ? secrets : {},
            createdAt: new Date().toISOString()
        };

        const filePath = await util.saveFile(backupName, JSON.stringify(backupData, null, 2));
        if (filePath) {
            const msg = includeSecrets 
                ? `Backup saved with credentials: ${filePath}`
                : `Backup saved (without credentials): ${filePath}`;
            await util.notify(msg);
        }
    }

    async restore(id?: string): Promise<void> {
        if (!id) return;

        const filePath = await util.openFile({ 'JSON Files': ['json'] });
        if (!filePath) return;

        const instance = configService.getInstance(id);
        if (!instance) return;

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const backup = JSON.parse(content);

            if (instance.status === InstanceStatus.Running) {
                await processService.stop(instance);
            }

            // Restore config
            configService.writeOpenClawConfig(instance.stateDir, backup.config);
            
            // Restore model
            if (backup.instance?.model) {
                configService.updateModelConfig(id, backup.instance.model);
            }
            
            // Restore channels
            if (backup.instance?.channels) {
                Object.entries(backup.instance.channels).forEach(([channel, config]) => {
                    configService.updateChannelConfig(id, channel, config as ChannelConfig);
                });
            }
            
            // Restore secrets
            if (backup.secrets && Object.keys(backup.secrets).length > 0) {
                Object.entries(backup.secrets as Record<string, string>).forEach(([key, value]) => {
                    configService.setSecret(id, key, value);
                });
            }

            this._onChanged.fire();
            
            const msg = backup.secrets && Object.keys(backup.secrets).length > 0
                ? `Restored backup with credentials to ${instance.name}`
                : `Restored backup to ${instance.name} (credentials not included in backup)`;
            await util.notify(msg);
        } catch (err) {
            await util.error(`Failed to restore: ${err}`);
        }
    }

    // ==================== Import & Export ====================

    async exportAll(): Promise<void> {
        const configs = configService.exportInstances();
        const timestamp = new Date().toISOString().split('T')[0];
        const filePath = await util.saveFile(
            `openclaw-instances-${timestamp}.json`,
            JSON.stringify({ version: '1.0', instances: configs }, null, 2)
        );
        if (filePath) {
            await util.notify(`Exported ${configs.length} instances`);
        }
    }

    async import(): Promise<void> {
        const filePath = await util.openFile({ 'JSON Files': ['json'] });
        if (!filePath) return;

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);
            const instances = data.instances || [data];

            let imported = 0;
            for (const config of instances) {
                if (!configService.getInstance(config.id)) {
                    const stateDir = configService.getInstanceStateDir(config.id);
                    fs.mkdirSync(stateDir, { recursive: true });
                    
                    // Generate openclaw.json from config
                    const openclawConfig = {
                        gateway: {
                            port: config.port,
                            mode: 'local',
                            bind: 'loopback',
                            controlUi: { enabled: true },
                            auth: { mode: 'token' }
                        },
                        agents: {
                            list: [{ id: 'main', model: config.model || 'default' }]
                        },
                        channels: config.channels || {}
                    };
                    configService.writeOpenClawConfig(stateDir, openclawConfig);
                    
                    configService.createInstance({ ...config, stateDir });
                    imported++;
                }
            }

            this._onChanged.fire();
            await util.notify(`Imported ${imported} instances`);
        } catch (err) {
            await util.error(`Failed to import: ${err}`);
        }
    }

    // ==================== Health Check ====================

    async healthCheck(id?: string): Promise<InstanceHealth | undefined> {
        if (!id) return;
        const instance = configService.getInstance(id);
        if (!instance) return;

        const health = await processService.healthCheck(instance);
        this._onChanged.fire();
        return health;
    }

    private startHealthCheck(): void {
        const interval = vscode.workspace.getConfiguration('openclawManager').get('healthCheckInterval', 30000);
        
        this.healthCheckInterval = setInterval(async () => {
            for (const instance of configService.getInstances()) {
                if (instance.status === InstanceStatus.Running) {
                    await processService.healthCheck(instance);
                }
            }
            this._onChanged.fire();
        }, interval);
    }

    // ==================== Helpers ====================

    private generateConfig(template: InstanceTemplate, port: number, model?: string): Record<string, unknown> {
        // Base config with model
        const baseConfig = {
            gateway: {
                port,
                mode: 'local',
                bind: 'loopback',
                controlUi: { enabled: true },
                auth: { mode: 'token' }
            },
            agents: {
                list: [{ id: 'main', model: model || 'default' }]
            }
        };

        // Deep merge with template config (template takes precedence, but preserve model)
        const merged = this.deepMerge(baseConfig, template.config);
        
        // Ensure gateway port and model are set
        (merged.gateway as Record<string, unknown>).port = port;
        if (merged.agents && Array.isArray((merged.agents as Record<string, unknown>).list)) {
            const list = (merged.agents as Record<string, unknown>).list as Array<Record<string, unknown>>;
            if (list.length > 0) {
                list[0].model = model || 'default';
            }
        }

        return merged;
    }

    private deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
        const result = { ...target };
        for (const key of Object.keys(source)) {
            if (
                typeof source[key] === 'object' &&
                source[key] !== null &&
                !Array.isArray(source[key]) &&
                typeof result[key] === 'object' &&
                result[key] !== null
            ) {
                result[key] = this.deepMerge(
                    result[key] as Record<string, unknown>,
                    source[key] as Record<string, unknown>
                );
            } else {
                result[key] = source[key];
            }
        }
        return result;
    }

    // ==================== Getters ====================

    getInstances(): Instance[] {
        return configService.getInstances();
    }

    getInstance(id: string): Instance | undefined {
        return configService.getInstance(id);
    }

    dispose(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        processService.dispose();
        util.dispose();
        this._onChanged.dispose();
    }
}
