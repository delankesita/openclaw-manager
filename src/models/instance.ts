export enum InstanceStatus {
    Stopped = 'stopped',
    Starting = 'starting',
    Running = 'running',
    Stopping = 'stopping',
    Error = 'error'
}

export interface InstanceHealth {
    status: 'ok' | 'warning' | 'error';
    cpu: number;
    memory: number;
    uptime: number;
    lastCheck: Date;
    message?: string;
}

export interface InstanceConfig {
    id: string;
    name: string;
    port: number;
    stateDir: string;
    model?: string;
    channels?: Record<string, unknown>;
    enabled?: boolean;
    autoStart?: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface Instance extends InstanceConfig {
    status: InstanceStatus;
    health?: InstanceHealth;
    pid?: number;
}

export interface InstanceCreateOptions {
    name: string;
    port?: number;
    model?: string;
    cloneFrom?: string;
}
