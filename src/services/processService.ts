import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';
import { exec, spawn, ChildProcess, execSync } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import { Instance, InstanceStatus, InstanceHealth } from '../models/instance';
import { configService } from './configService';

const execAsync = promisify(exec);

export class ProcessService {
    private processes: Map<string, ChildProcess> = new Map();
    private reservedPorts: Set<number> = new Set(); // Ports reserved during instance creation
    private _onProcessChanged = new vscode.EventEmitter<string>();
    readonly onProcessChanged = this._onProcessChanged.event;

    async start(instance: Instance): Promise<void> {
        if (instance.status === InstanceStatus.Running) {
            throw new Error('Instance is already running');
        }

        const stateDir = instance.stateDir;
        const port = instance.port;

        // Ensure state directory exists
        fs.mkdirSync(stateDir, { recursive: true });

        // Check if port is available
        const available = await this.isPortAvailable(port);
        if (!available) {
            throw new Error(`Port ${port} is already in use`);
        }

        // Set status to starting
        configService.setInstanceStatus(instance.id, InstanceStatus.Starting);
        this._onProcessChanged.fire(instance.id);

        try {
            // Use scripts/start.sh instead of openclaw gateway start
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            
            // Check if we're in a project with scripts
            const scriptPath = workspaceRoot 
                ? path.join(workspaceRoot, 'scripts', 'start.sh')
                : null;

            let proc: ChildProcess;

            if (scriptPath && fs.existsSync(scriptPath)) {
                // Use project script
                proc = spawn('bash', [scriptPath], {
                    cwd: stateDir,
                    env: {
                        ...process.env,
                        OPENCLAW_STATE_DIR: stateDir,
                        PORT: String(port)
                    },
                    detached: false,
                    stdio: ['ignore', 'pipe', 'pipe']
                });
            } else {
                // Use openclaw directly with state dir
                proc = spawn('openclaw', ['--log-level', 'error', 'gateway', 'run'], {
                    cwd: stateDir,
                    env: {
                        ...process.env,
                        OPENCLAW_STATE_DIR: stateDir
                    },
                    detached: false,
                    stdio: ['ignore', 'pipe', 'pipe']
                });
            }

            this.processes.set(instance.id, proc);

            // Handle process events
            proc.on('exit', (code) => {
                this.processes.delete(instance.id);
                configService.setInstanceStatus(instance.id, InstanceStatus.Stopped);
                this._onProcessChanged.fire(instance.id);
            });

            proc.on('error', (err) => {
                console.error(`Process error for ${instance.id}:`, err);
                configService.setInstanceStatus(instance.id, InstanceStatus.Error);
                this._onProcessChanged.fire(instance.id);
            });

            // Wait for gateway to be ready
            await this.waitForGateway(port, 30000);

            configService.setInstanceStatus(instance.id, InstanceStatus.Running, proc.pid);
            this._onProcessChanged.fire(instance.id);

        } catch (err) {
            configService.setInstanceStatus(instance.id, InstanceStatus.Error);
            this._onProcessChanged.fire(instance.id);
            throw err;
        }
    }

    async stop(instance: Instance): Promise<void> {
        if (instance.status !== InstanceStatus.Running) {
            return;
        }

        configService.setInstanceStatus(instance.id, InstanceStatus.Stopping);
        this._onProcessChanged.fire(instance.id);

        try {
            // Kill the process
            const proc = this.processes.get(instance.id);
            if (proc) {
                proc.kill('SIGTERM');
                
                // Wait for process to exit
                await new Promise<void>((resolve) => {
                    proc.on('exit', () => resolve());
                    setTimeout(() => {
                        proc.kill('SIGKILL');
                        resolve();
                    }, 5000);
                });
                
                this.processes.delete(instance.id);
            }

            // Also try to stop via openclaw command
            try {
                await execAsync('openclaw --log-level error gateway stop', {
                    cwd: instance.stateDir,
                    env: { ...process.env, OPENCLAW_STATE_DIR: instance.stateDir },
                    timeout: 5000
                });
            } catch {
                // Ignore errors from stop command
            }

            configService.setInstanceStatus(instance.id, InstanceStatus.Stopped);
            this._onProcessChanged.fire(instance.id);

        } catch (err) {
            console.error('Stop error:', err);
            configService.setInstanceStatus(instance.id, InstanceStatus.Error);
            this._onProcessChanged.fire(instance.id);
            throw err;
        }
    }

    async restart(instance: Instance): Promise<void> {
        await this.stop(instance);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.start(instance);
    }

    async healthCheck(instance: Instance): Promise<InstanceHealth> {
        const health: InstanceHealth = {
            status: 'error',
            cpu: 0,
            memory: 0,
            uptime: 0,
            lastCheck: new Date()
        };

        if (instance.status !== InstanceStatus.Running) {
            health.message = 'Instance not running';
            return health;
        }

        try {
            const response = await axios.get(`http://localhost:${instance.port}/health`, {
                timeout: 5000
            });

            health.status = 'ok';
            health.cpu = response.data?.cpu || 0;
            health.memory = response.data?.memory || 0;
            health.uptime = response.data?.uptime || 0;

        } catch (err) {
            health.status = 'error';
            health.message = 'Connection failed';
        }

        configService.setInstanceHealth(instance.id, health);
        return health;
    }

    private isPortAvailable(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = net.createServer();
            server.once('error', () => resolve(false));
            server.once('listening', () => {
                server.close();
                resolve(true);
            });
            server.listen(port, '127.0.0.1');
        });
    }

    private waitForGateway(port: number, timeout = 30000): Promise<void> {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const check = async () => {
                try {
                    await axios.get(`http://localhost:${port}/health`, { timeout: 1000 });
                    resolve();
                } catch {
                    if (Date.now() - startTime > timeout) {
                        reject(new Error('Gateway did not start within timeout'));
                    } else {
                        setTimeout(check, 500);
                    }
                }
            };
            check();
        });
    }

    async findAvailablePort(startPort: number, usedPorts: Set<number>): Promise<number> {
        let port = startPort;
        while (true) {
            // Check if port is already used by existing instances or reserved
            if (!usedPorts.has(port) && !this.reservedPorts.has(port)) {
                const available = await this.isPortAvailable(port);
                if (available) {
                    // Reserve the port immediately to prevent race conditions
                    this.reservedPorts.add(port);
                    return port;
                }
            }
            port++;
        }
    }

    // Release a reserved port (if instance creation fails)
    releasePort(port: number): void {
        this.reservedPorts.delete(port);
    }

    isProcessRunning(id: string): boolean {
        return this.processes.has(id);
    }

    getProcessPid(id: string): number | undefined {
        return this.processes.get(id)?.pid;
    }

    dispose(): void {
        this.processes.forEach((proc, id) => {
            try {
                proc.kill('SIGTERM');
            } catch (err) {
                console.error(`Failed to kill process ${id}:`, err);
            }
        });
        this.processes.clear();
    }
}

export const processService = new ProcessService();
