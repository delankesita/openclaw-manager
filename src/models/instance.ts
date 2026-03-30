import * as vscode from 'vscode';

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

export interface ChannelConfig {
    enabled: boolean;
    mode?: 'websocket' | 'stream' | 'webhook';
    appId?: string;
    appSecret?: string;
    clientId?: string;
    clientSecret?: string;
    corpId?: string;
    agentId?: string;
    secret?: string;
    botToken?: string;
    [key: string]: unknown;
}

export interface Instance {
    id: string;
    name: string;
    port: number;
    stateDir: string;
    status: InstanceStatus;
    health?: InstanceHealth;
    pid?: number;
    
    // Configuration
    model?: string;
    channels?: Record<string, ChannelConfig>;
    autoStart?: boolean;
    
    // Metadata
    createdAt: Date;
    updatedAt: Date;
    
    // Secrets (stored separately, not exported)
    secrets?: Record<string, string>;
}

export interface InstanceTemplate {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    tags: string[];
    config: Record<string, unknown>;
    channels?: string[];
}

// Persisted config (without runtime state)
export type InstanceConfig = Omit<Instance, 'status' | 'health' | 'pid'>;
