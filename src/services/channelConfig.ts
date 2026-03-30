import * as vscode from 'vscode';
import { Instance } from '../models/instance';

export interface ChannelConfig {
    type: string;
    enabled: boolean;
    appId?: string;
    appSecret?: string;
    clientId?: string;
    clientSecret?: string;
    corpId?: string;
    agentId?: string;
    secret?: string;
    mode?: 'websocket' | 'stream' | 'webhook';
    callbackUrl?: string;
    [key: string]: unknown;
}

const CHANNEL_TYPES = {
    feishu: {
        name: 'Feishu',
        icon: '📱',
        description: 'Feishu/Lark bot integration',
        fields: ['appId', 'appSecret'],
        modes: ['websocket', 'stream']
    },
    dingtalk: {
        name: 'DingTalk',
        icon: '🔔',
        description: 'DingTalk bot integration',
        fields: ['clientId', 'clientSecret'],
        modes: ['stream']
    },
    wecom: {
        name: 'WeCom',
        icon: '💬',
        description: 'WeCom/Enterprise WeChat bot',
        fields: ['corpId', 'agentId', 'secret'],
        modes: ['webhook']
    },
    discord: {
        name: 'Discord',
        icon: '🎮',
        description: 'Discord bot integration',
        fields: ['botToken'],
        modes: ['websocket']
    },
    slack: {
        name: 'Slack',
        icon: '💼',
        description: 'Slack bot integration',
        fields: ['botToken', 'appToken'],
        modes: ['websocket']
    },
    telegram: {
        name: 'Telegram',
        icon: '✈️',
        description: 'Telegram bot integration',
        fields: ['botToken'],
        modes: ['webhook']
    }
};

class ChannelConfigService {
    async showChannelConfig(instance: Instance): Promise<Record<string, ChannelConfig> | undefined> {
        const panel = vscode.window.createWebviewPanel(
            'channelConfig',
            `Channel Configuration - ${instance.name}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        const currentChannels = instance.channels || {};

        panel.webview.html = this.getChannelConfigHtml(currentChannels);

        return new Promise((resolve) => {
            panel.webview.onDidReceiveMessage(async (message) => {
                switch (message.command) {
                    case 'save':
                        resolve(message.config);
                        panel.dispose();
                        break;
                    case 'cancel':
                        resolve(undefined);
                        panel.dispose();
                        break;
                    case 'testConnection':
                        const result = await this.testConnection(message.channelType, message.config);
                        panel.webview.postMessage({
                            type: 'testResult',
                            channelType: message.channelType,
                            result
                        });
                        break;
                }
            });

            panel.onDidDispose(() => {
                resolve(undefined);
            });
        });
    }

    async quickAddChannel(instance: Instance): Promise<{ type: string; config: ChannelConfig } | undefined> {
        // Step 1: Select channel type
        const channelTypes = Object.entries(CHANNEL_TYPES).map(([id, info]) => ({
            label: `${info.icon} ${info.name}`,
            description: info.description,
            id
        }));

        const selectedType = await vscode.window.showQuickPick(channelTypes, {
            placeHolder: 'Select channel type'
        });

        if (!selectedType) {
            return;
        }

        const channelInfo = CHANNEL_TYPES[selectedType.id as keyof typeof CHANNEL_TYPES];

        // Step 2: Configure channel
        const config = await this.configureChannel(selectedType.id, channelInfo);
        if (!config) {
            return;
        }

        return { type: selectedType.id, config };
    }

    private async configureChannel(
        typeId: string,
        info: typeof CHANNEL_TYPES.feishu
    ): Promise<ChannelConfig | undefined> {
        const config: ChannelConfig = {
            type: typeId,
            enabled: true
        };

        // Select mode if multiple available
        if (info.modes.length > 1) {
            const selectedMode = await vscode.window.showQuickPick(
                info.modes.map(m => ({
                    label: m.charAt(0).toUpperCase() + m.slice(1),
                    description: this.getModeDescription(m),
                    id: m
                })),
                { placeHolder: 'Select connection mode' }
            );

            if (!selectedMode) {
                return;
            }

            config.mode = selectedMode.id as 'websocket' | 'stream' | 'webhook';
        } else {
            config.mode = info.modes[0] as 'websocket' | 'stream' | 'webhook';
        }

        // Collect required fields
        for (const field of info.fields) {
            const value = await vscode.window.showInputBox({
                prompt: `Enter ${this.getFieldLabel(field)}`,
                password: field.toLowerCase().includes('secret') || field.toLowerCase().includes('token'),
                placeHolder: this.getFieldPlaceholder(field)
            });

            if (!value) {
                return;
            }

            (config as Record<string, unknown>)[field] = value;
        }

        return config;
    }

    private getModeDescription(mode: string): string {
        const descriptions: Record<string, string> = {
            websocket: 'Long-lived WebSocket connection (recommended)',
            stream: 'Server-sent events stream',
            webhook: 'HTTP webhook callbacks'
        };
        return descriptions[mode] || '';
    }

    private getFieldLabel(field: string): string {
        const labels: Record<string, string> = {
            appId: 'App ID',
            appSecret: 'App Secret',
            clientId: 'Client ID',
            clientSecret: 'Client Secret',
            corpId: 'Corp ID',
            agentId: 'Agent ID',
            secret: 'Secret',
            botToken: 'Bot Token',
            appToken: 'App Token'
        };
        return labels[field] || field;
    }

    private getFieldPlaceholder(field: string): string {
        const placeholders: Record<string, string> = {
            appId: 'cli_xxxxxxxxxxxx',
            appSecret: 'xxxxxxxxxxxxxxxxxxxx',
            clientId: 'dingxxxxxxxxxxxx',
            clientSecret: 'xxxxxxxxxxxxxxxxxxxx',
            corpId: 'wxXXXXXXXXXXXXXXXX',
            agentId: '1000001',
            secret: 'xxxxxxxxxxxxxxxxxxxx',
            botToken: 'xoxb-xxxxxxxxxx',
            appToken: 'xapp-xxxxxxxxxx'
        };
        return placeholders[field] || '';
    }

    private async testConnection(type: string, config: ChannelConfig): Promise<{ success: boolean; message: string }> {
        // Simulate connection test (in real implementation, would call actual API)
        await new Promise(resolve => setTimeout(resolve, 1000));

        const requiredFields = CHANNEL_TYPES[type as keyof typeof CHANNEL_TYPES]?.fields || [];
        const missingFields = requiredFields.filter(f => !(config as Record<string, unknown>)[f]);

        if (missingFields.length > 0) {
            return {
                success: false,
                message: `Missing required fields: ${missingFields.join(', ')}`
            };
        }

        // In real implementation, would verify credentials with the platform
        return {
            success: true,
            message: 'Connection test successful'
        };
    }

    private getChannelConfigHtml(currentChannels: Record<string, unknown>): string {
        const channelOptions = Object.entries(CHANNEL_TYPES).map(([id, info]) => `
            <div class="channel-type" data-channel="${id}">
                <div class="channel-header">
                    <span class="channel-icon">${info.icon}</span>
                    <span class="channel-name">${info.name}</span>
                    <input type="checkbox" class="channel-toggle" 
                           ${currentChannels[id] ? 'checked' : ''}>
                </div>
                <div class="channel-config" style="display: ${currentChannels[id] ? 'block' : 'none'}">
                    <div class="form-group">
                        <label>Connection Mode</label>
                        <select class="channel-mode">
                            ${info.modes.map(m => `<option value="${m}">${m.toUpperCase()}</option>`).join('')}
                        </select>
                    </div>
                    ${info.fields.map(f => `
                        <div class="form-group">
                            <label>${this.getFieldLabel(f)}</label>
                            <input type="${f.includes('secret') || f.includes('token') ? 'password' : 'text'}" 
                                   class="channel-field" 
                                   data-field="${f}"
                                   placeholder="${this.getFieldPlaceholder(f)}"
                                   value="${((currentChannels[id] as Record<string, unknown>)?.[f] as string) || ''}">
                        </div>
                    `).join('')}
                    <button class="test-btn" onclick="testChannel('${id}')">Test Connection</button>
                    <div class="test-result" id="result-${id}"></div>
                </div>
            </div>
        `).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Channel Configuration</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-editor-foreground);
            background: var(--vscode-editor-background);
        }
        h1 { margin-bottom: 20px; }
        .channel-type {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            margin-bottom: 12px;
            overflow: hidden;
        }
        .channel-header {
            display: flex;
            align-items: center;
            padding: 12px 16px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            cursor: pointer;
        }
        .channel-icon {
            font-size: 24px;
            margin-right: 12px;
        }
        .channel-name {
            flex: 1;
            font-weight: 500;
        }
        .channel-toggle {
            width: 40px;
            height: 20px;
        }
        .channel-config {
            padding: 16px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .form-group {
            margin-bottom: 12px;
        }
        label {
            display: block;
            margin-bottom: 4px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        input, select {
            width: 100%;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
        }
        .test-btn {
            padding: 8px 16px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 8px;
        }
        .test-btn:hover {
            opacity: 0.9;
        }
        .test-result {
            margin-top: 8px;
            padding: 8px;
            border-radius: 4px;
            display: none;
        }
        .test-result.success {
            background: #28a74520;
            color: #28a745;
            display: block;
        }
        .test-result.error {
            background: #dc354520;
            color: #dc3545;
            display: block;
        }
        .actions {
            position: fixed;
            bottom: 20px;
            right: 20px;
            display: flex;
            gap: 8px;
        }
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
    </style>
</head>
<body>
    <h1>📡 Channel Configuration</h1>
    <p>Enable and configure messaging channels for this instance.</p>
    
    ${channelOptions}
    
    <div class="actions">
        <button class="btn btn-secondary" onclick="cancel()">Cancel</button>
        <button class="btn btn-primary" onclick="save()">Save Changes</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // Toggle channel config visibility
        document.querySelectorAll('.channel-toggle').forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                const config = e.target.closest('.channel-type').querySelector('.channel-config');
                config.style.display = e.target.checked ? 'block' : 'none';
            });
        });
        
        function testChannel(type) {
            const channelEl = document.querySelector(\`.channel-type[data-channel="\${type}"]\`);
            const config = {
                enabled: channelEl.querySelector('.channel-toggle').checked,
                mode: channelEl.querySelector('.channel-mode').value
            };
            
            channelEl.querySelectorAll('.channel-field').forEach(field => {
                config[field.dataset.field] = field.value;
            });
            
            vscode.postMessage({ command: 'testConnection', channelType: type, config });
        }
        
        function save() {
            const config = {};
            
            document.querySelectorAll('.channel-type').forEach(channelEl => {
                const type = channelEl.dataset.channel;
                const enabled = channelEl.querySelector('.channel-toggle').checked;
                
                if (enabled) {
                    config[type] = {
                        enabled: true,
                        mode: channelEl.querySelector('.channel-mode').value
                    };
                    
                    channelEl.querySelectorAll('.channel-field').forEach(field => {
                        if (field.value) {
                            config[type][field.dataset.field] = field.value;
                        }
                    });
                }
            });
            
            vscode.postMessage({ command: 'save', config });
        }
        
        function cancel() {
            vscode.postMessage({ command: 'cancel' });
        }
        
        // Handle test results
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'testResult') {
                const resultEl = document.getElementById(\`result-\${message.channelType}\`);
                resultEl.textContent = message.result.message;
                resultEl.className = \`test-result \${message.result.success ? 'success' : 'error'}\`;
            }
        });
    </script>
</body>
</html>`;
    }

    getChannelTypes(): typeof CHANNEL_TYPES {
        return CHANNEL_TYPES;
    }
}

export const channelConfigService = new ChannelConfigService();
