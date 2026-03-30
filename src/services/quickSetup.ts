import * as vscode from 'vscode';
import { templates, getTemplate, InstanceTemplate } from '../templates/templates';
import { notification } from './notification';
import { logger } from './logger';

export interface QuickSetupResult {
    templateId: string;
    instanceName: string;
    port: number;
    model?: string;
    channels?: string[];
}

class QuickSetupService {
    async showQuickSetup(): Promise<QuickSetupResult | undefined> {
        // Step 1: Choose template
        const templateItems = templates.map(t => ({
            label: `${t.icon} ${t.name}`,
            description: t.description,
            detail: `Category: ${t.category} | Tags: ${t.tags.join(', ')}`,
            id: t.id
        }));

        const selectedTemplate = await vscode.window.showQuickPick(templateItems, {
            placeHolder: 'Choose an instance template',
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (!selectedTemplate) {
            return;
        }

        const template = getTemplate(selectedTemplate.id);
        if (!template) {
            return;
        }

        // Step 2: Instance name
        const instanceName = await vscode.window.showInputBox({
            prompt: 'Enter instance name',
            placeHolder: template.name.toLowerCase().replace(/\s+/g, '-'),
            validateInput: (value) => {
                if (!value.trim()) {
                    return 'Instance name is required';
                }
                if (!/^[a-z0-9-]+$/.test(value.toLowerCase().replace(/\s+/g, '-'))) {
                    return 'Name can only contain lowercase letters, numbers, and hyphens';
                }
                return;
            }
        });

        if (!instanceName) {
            return;
        }

        // Step 3: Port
        const portInput = await vscode.window.showInputBox({
            prompt: 'Enter port number',
            placeHolder: '5000',
            validateInput: (value) => {
                const port = parseInt(value);
                if (isNaN(port) || port < 1024 || port > 65535) {
                    return 'Port must be between 1024 and 65535';
                }
                return;
            }
        });

        if (!portInput) {
            return;
        }

        // Step 4: Model (optional)
        const modelOptions = [
            { label: 'Default', description: 'Use default model configuration' },
            { label: 'fast', description: 'MiniMax M2.5 - Fast response' },
            { label: 'qwen', description: 'Qwen 3.5 - Chinese optimized' },
            { label: 'deepseek', description: 'DeepSeek V3 - Code focused' },
            { label: 'qwq', description: 'QWQ 32B - Reasoning' },
            { label: 'Custom', description: 'Enter custom model ID' }
        ];

        const selectedModel = await vscode.window.showQuickPick(modelOptions, {
            placeHolder: 'Choose default model (optional)'
        });

        let model: string | undefined;
        if (selectedModel) {
            if (selectedModel.label === 'Custom') {
                model = await vscode.window.showInputBox({
                    prompt: 'Enter custom model ID',
                    placeHolder: 'nvidia/minimaxai/minimax-m2.5'
                });
            } else if (selectedModel.label !== 'Default') {
                model = selectedModel.label;
            }
        }

        // Step 5: Channels (if applicable)
        let channels: string[] | undefined;
        if (template.channels && template.channels.length > 0) {
            const channelItems = [
                { label: 'Skip', description: 'Configure channels later' },
                ...template.channels.map(c => ({
                    label: c,
                    description: `Configure ${c} channel`,
                    picked: true
                }))
            ];

            const selectedChannels = await vscode.window.showQuickPick(channelItems, {
                placeHolder: 'Select channels to configure',
                canPickMany: true
            });

            if (selectedChannels && selectedChannels.length > 0) {
                channels = selectedChannels
                    .filter(c => c.label !== 'Skip')
                    .map(c => c.label);
            }
        }

        // Summary
        const result: QuickSetupResult = {
            templateId: template.id,
            instanceName: instanceName.toLowerCase().replace(/\s+/g, '-'),
            port: parseInt(portInput),
            model,
            channels
        };

        const confirm = await vscode.window.showQuickPick(
            [
                {
                    label: '✓ Create Instance',
                    description: `Create "${result.instanceName}" on port ${result.port}`
                },
                { label: '✗ Cancel', description: 'Abort setup' }
            ],
            { placeHolder: 'Confirm instance creation' }
        );

        if (!confirm || confirm.label.startsWith('✗')) {
            return;
        }

        logger.info('Quick setup completed', result);
        return result;
    }

    async showChannelSetup(channelName: string): Promise<Record<string, string> | undefined> {
        const channelConfigs: Record<string, { fields: string[]; description: string }> = {
            feishu: {
                fields: ['appId', 'appSecret'],
                description: 'Feishu bot credentials'
            },
            dingtalk: {
                fields: ['clientId', 'clientSecret'],
                description: 'DingTalk bot credentials'
            },
            wecom: {
                fields: ['corpId', 'agentId', 'secret'],
                description: 'WeCom bot credentials'
            }
        };

        const config = channelConfigs[channelName];
        if (!config) {
            notification.error(`Unknown channel: ${channelName}`);
            return;
        }

        notification.info(`Configuring ${channelName} channel...`);

        const credentials: Record<string, string> = {};

        for (const field of config.fields) {
            const value = await vscode.window.showInputBox({
                prompt: `Enter ${channelName} ${field}`,
                password: field.toLowerCase().includes('secret')
            });

            if (!value) {
                return;
            }

            credentials[field] = value;
        }

        return credentials;
    }

    async showAdvancedSetup(): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'openclawAdvancedSetup',
            'Advanced Instance Setup',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = this.getAdvancedSetupHtml();
    }

    private getAdvancedSetupHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Advanced Setup</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-editor-foreground);
        }
        .form-group {
            margin-bottom: 16px;
        }
        label {
            display: block;
            margin-bottom: 4px;
            font-weight: 500;
        }
        input, select {
            width: 100%;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
        }
        .help-text {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <h1>Advanced Instance Configuration</h1>
    
    <div class="form-group">
        <label>Instance Name</label>
        <input type="text" id="name" placeholder="my-instance">
        <div class="help-text">Unique identifier for this instance</div>
    </div>
    
    <div class="form-group">
        <label>Port</label>
        <input type="number" id="port" value="5000">
    </div>
    
    <div class="form-group">
        <label>Default Model</label>
        <select id="model">
            <option value="">Default</option>
            <option value="fast">MiniMax M2.5 (Fast)</option>
            <option value="qwen">Qwen 3.5</option>
            <option value="deepseek">DeepSeek V3</option>
        </select>
    </div>
    
    <div class="form-group">
        <label>Max Concurrent Operations</label>
        <input type="number" id="maxConcurrent" value="4">
        <div class="help-text">Maximum parallel operations</div>
    </div>
    
    <div class="form-group">
        <label>Gateway Mode</label>
        <select id="mode">
            <option value="local">Local</option>
            <option value="remote">Remote</option>
        </select>
    </div>
    
    <button onclick="submit()">Create Instance</button>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function submit() {
            const config = {
                name: document.getElementById('name').value,
                port: parseInt(document.getElementById('port').value),
                model: document.getElementById('model').value,
                maxConcurrent: parseInt(document.getElementById('maxConcurrent').value),
                mode: document.getElementById('mode').value
            };
            
            vscode.postMessage({ command: 'create', config });
        }
    </script>
</body>
</html>`;
    }
}

export const quickSetupService = new QuickSetupService();
