import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import * as net from 'net';
import { Instance, InstanceStatus, InstanceCreateOptions, InstanceHealth } from '../models/instance';

const execAsync = promisify(exec);

export class OpenClawManager implements vscode.Disposable {
    private context: vscode.ExtensionContext;
    private instances: Map<string, Instance> = new Map();
    private processes: Map<string, ChildProcess> = new Map();
    private instancesDir: string;
    private healthCheckInterval?: NodeJS.Timeout;
    private _onInstancesChanged: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onInstancesChanged: vscode.Event<void> = this._onInstancesChanged.event;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.instancesDir = vscode.workspace.getConfiguration('openclawManager')
            .get('instancesDir', '~/.openclaw-instances')
            .replace('~', os.homedir());
        
        this.ensureInstancesDir();
        this.loadInstances();
        this.startHealthCheck();
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
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to load instances: ${err}`);
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
        
        const tempFile = configFile + '.tmp';
        try {
            fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
            fs.renameSync(tempFile, configFile);
        } catch (err) {
            console.error('Failed to save instances:', err);
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
        
        // Check for collisions
        if (this.instances.has(id) && !options?.cloneFrom) {
            vscode.window.showErrorMessage(`Instance with ID "${id}" already exists`);
            return;
        }

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
                    list: [{ id: 'main', model: 'default' }]
                }
            };
            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        }

        const instance: Instance = {
            id,
            name,
            port,
            stateDir,
            status: InstanceStatus.Stopped,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.instances.set(id, instance);
        this.saveInstances();
        this._onInstancesChanged.fire();

        vscode.window.showInformationMessage(`Created OpenClaw instance: ${name}`);
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
            vscode.window.showErrorMessage(`Instance ${id} not found`);
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Delete instance "${instance.name}"? This cannot be undone.`,
            'Delete',
            'Cancel'
        );

        if (confirm !== 'Delete') {
            return;
        }

        // Stop instance first
        await this.stopInstanceInternal(id);

        // Remove directory
        const instanceDir = path.join(this.instancesDir, id);
        fs.rmSync(instanceDir, { recursive: true, force: true });

        this.instances.delete(id);
        this.saveInstances();
        this._onInstancesChanged.fire();

        vscode.window.showInformationMessage(`Deleted instance: ${instance.name}`);
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
            vscode.window.showErrorMessage(`Instance ${id} not found`);
            return;
        }

        if (instance.status === InstanceStatus.Running) {
            vscode.window.showWarningMessage(`Instance ${instance.name} is already running`);
            return;
        }

        instance.status = InstanceStatus.Starting;
        this._onInstancesChanged.fire();

        try {
            const proc = spawn('openclaw', ['gateway', 'start'], {
                cwd: instance.stateDir,
                env: { ...process.env, OPENCLAW_STATE_DIR: instance.stateDir },
                detached: true,
                stdio: 'ignore'
            });

            proc.unref();
            this.processes.set(id, proc);

            // Wait for gateway to be ready
            await this.waitForGateway(instance.port);

            instance.status = InstanceStatus.Running;
            instance.pid = proc.pid;
            instance.updatedAt = new Date();
            this._onInstancesChanged.fire();

            vscode.window.showInformationMessage(`Started instance: ${instance.name}`);
        } catch (err) {
            instance.status = InstanceStatus.Error;
            this._onInstancesChanged.fire();
            vscode.window.showErrorMessage(`Failed to start ${instance.name}: ${err}`);
        }
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
        vscode.window.showInformationMessage(`Stopped instance: ${this.instances.get(id)?.name}`);
    }

    private async stopInstanceInternal(id: string): Promise<void> {
        const instance = this.instances.get(id);
        if (!instance || instance.status === InstanceStatus.Stopped) {
            return;
        }

        instance.status = InstanceStatus.Stopping;
        this._onInstancesChanged.fire();

        try {
            const proc = this.processes.get(id);
            if (proc) {
                proc.kill('SIGTERM');
                this.processes.delete(id);
            }

            // Also try to stop via CLI
            await execAsync('openclaw gateway stop', {
                cwd: instance.stateDir,
                env: { ...process.env, OPENCLAW_STATE_DIR: instance.stateDir }
            });
        } catch (err) {
            console.error('Stop error:', err);
        }

        instance.status = InstanceStatus.Stopped;
        instance.pid = undefined;
        instance.updatedAt = new Date();
        this._onInstancesChanged.fire();
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

        await this.stopInstanceInternal(id);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.startInstance(id);
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
            vscode.window.showErrorMessage(`Instance ${id} not found`);
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
        if (!id) {
            return;
        }

        const instance = this.instances.get(id);
        if (!instance) return;

        const configPath = path.join(instance.stateDir, 'openclaw.json');
        if (fs.existsSync(configPath)) {
            const uri = vscode.Uri.file(configPath);
            vscode.window.showTextDocument(uri);
        } else {
            vscode.window.showErrorMessage('Config file not found');
        }
    }

    viewLogs(id?: string): void {
        if (!id) {
            return;
        }

        const instance = this.instances.get(id);
        if (!instance) return;

        const logDir = path.join(instance.stateDir, 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const logFile = path.join(logDir, 'gateway.log');
        if (fs.existsSync(logFile)) {
            const uri = vscode.Uri.file(logFile);
            vscode.window.showTextDocument(uri);
        } else {
            // Create terminal for logs
            const terminal = vscode.window.createTerminal(`OpenClaw Logs: ${instance.name}`);
            const logPattern = path.join(instance.stateDir, 'logs', '*.log');
            if (process.platform === 'win32') {
                terminal.sendText(`Get-Content "${logPattern}" -Wait -Tail 100`);
            } else {
                terminal.sendText(`tail -f "${logPattern}"`);
            }
            terminal.show();
        }
    }

    async healthCheck(id?: string): Promise<InstanceHealth | undefined> {
        if (!id) {
            return;
        }

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
                message: 'Connection failed'
            };
        }
        
        this._onInstancesChanged.fire();
        return instance.health;
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

    private async findAvailablePort(startPort: number): Promise<number> {
        const managedPorts = new Set(Array.from(this.instances.values()).map(i => i.port));
        let port = startPort;
        
        while (true) {
            if (!managedPorts.has(port)) {
                const available = await this.isPortAvailable(port);
                if (available) {
                    return port;
                }
            }
            port++;
        }
    }

    private isPortAvailable(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = net.createServer();
            server.once('error', () => {
                resolve(false);
            });
            server.once('listening', () => {
                server.close();
                resolve(true);
            });
            server.listen(port, '127.0.0.1');
        });
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
        const interval = vscode.workspace.getConfiguration('openclawManager').get('healthCheckInterval', 30000);
        
        this.healthCheckInterval = setInterval(() => {
            this.instances.forEach(async (instance, id) => {
                if (instance.status === InstanceStatus.Running) {
                    await this.healthCheck(id);
                }
            });
        }, interval);
    }

    dispose(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        this.processes.forEach((proc, id) => {
            try {
                proc.kill('SIGTERM');
            } catch (err) {
                console.error(`Failed to kill process for instance ${id}:`, err);
            }
        });
        this._onInstancesChanged.dispose();
    }
}
