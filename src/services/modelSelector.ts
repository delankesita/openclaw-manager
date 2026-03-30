import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface ModelProvider {
    id: string;
    name: string;
    icon: string;
    models: Model[];
    requiresApiKey: boolean;
    baseUrl?: string;
}

export interface Model {
    id: string;
    name: string;
    provider: string;
    contextWindow: number;
    features: string[];
    pricing?: {
        input: number;
        output: number;
        unit: 'per-1k-tokens' | 'per-1m-tokens';
    };
    recommended?: boolean;
}

const MODEL_PROVIDERS: ModelProvider[] = [
    {
        id: 'nvidia',
        name: 'NVIDIA NIM',
        icon: '🟢',
        requiresApiKey: true,
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        models: [
            {
                id: 'nvidia/minimaxai/minimax-m2.5',
                name: 'MiniMax M2.5',
                provider: 'nvidia',
                contextWindow: 128000,
                features: ['fast', 'reasoning', 'multilingual'],
                recommended: true,
                pricing: { input: 0, output: 0, unit: 'per-1m-tokens' }
            },
            {
                id: 'nvidia/deepseek-ai/deepseek-v3',
                name: 'DeepSeek V3',
                provider: 'nvidia',
                contextWindow: 128000,
                features: ['coding', 'reasoning'],
                recommended: true
            },
            {
                id: 'nvidia/qwen/qwen3-30b-a3b',
                name: 'Qwen 3 30B',
                provider: 'nvidia',
                contextWindow: 32000,
                features: ['fast', 'chinese-optimized']
            },
            {
                id: 'nvidia/qwen/qwen2.5-72b-instruct',
                name: 'Qwen 2.5 72B',
                provider: 'nvidia',
                contextWindow: 131072,
                features: ['reasoning', 'multilingual']
            },
            {
                id: 'nvidia/google/gemma-3-27b-it',
                name: 'Gemma 3 27B',
                provider: 'nvidia',
                contextWindow: 128000,
                features: ['fast', 'multilingual']
            },
            {
                id: 'nvidia/meta/llama-3.3-70b-instruct',
                name: 'Llama 3.3 70B',
                provider: 'nvidia',
                contextWindow: 128000,
                features: ['general', 'reasoning']
            }
        ]
    },
    {
        id: 'coze',
        name: 'Coze',
        icon: '🤖',
        requiresApiKey: false,
        models: [
            {
                id: 'default',
                name: 'Coze Default Model',
                provider: 'coze',
                contextWindow: 128000,
                features: ['fast', 'auto'],
                recommended: true
            }
        ]
    },
    {
        id: 'openai',
        name: 'OpenAI',
        icon: '🟣',
        requiresApiKey: true,
        baseUrl: 'https://api.openai.com/v1',
        models: [
            {
                id: 'gpt-4o',
                name: 'GPT-4o',
                provider: 'openai',
                contextWindow: 128000,
                features: ['reasoning', 'vision', 'multilingual'],
                pricing: { input: 2.5, output: 10, unit: 'per-1m-tokens' }
            },
            {
                id: 'gpt-4o-mini',
                name: 'GPT-4o Mini',
                provider: 'openai',
                contextWindow: 128000,
                features: ['fast', 'vision'],
                pricing: { input: 0.15, output: 0.6, unit: 'per-1m-tokens' }
            },
            {
                id: 'o1',
                name: 'O1',
                provider: 'openai',
                contextWindow: 200000,
                features: ['reasoning', 'advanced'],
                pricing: { input: 15, output: 60, unit: 'per-1m-tokens' }
            }
        ]
    },
    {
        id: 'anthropic',
        name: 'Anthropic',
        icon: '🟠',
        requiresApiKey: true,
        baseUrl: 'https://api.anthropic.com',
        models: [
            {
                id: 'claude-sonnet-4-20250514',
                name: 'Claude Sonnet 4',
                provider: 'anthropic',
                contextWindow: 200000,
                features: ['reasoning', 'coding', 'vision'],
                recommended: true,
                pricing: { input: 3, output: 15, unit: 'per-1m-tokens' }
            },
            {
                id: 'claude-opus-4-20250514',
                name: 'Claude Opus 4',
                provider: 'anthropic',
                contextWindow: 200000,
                features: ['reasoning', 'advanced', 'vision'],
                pricing: { input: 15, output: 75, unit: 'per-1m-tokens' }
            },
            {
                id: 'claude-3-5-haiku-20241022',
                name: 'Claude 3.5 Haiku',
                provider: 'anthropic',
                contextWindow: 200000,
                features: ['fast', 'efficient'],
                pricing: { input: 0.8, output: 4, unit: 'per-1m-tokens' }
            }
        ]
    },
    {
        id: 'deepseek',
        name: 'DeepSeek',
        icon: '🔵',
        requiresApiKey: true,
        baseUrl: 'https://api.deepseek.com',
        models: [
            {
                id: 'deepseek-chat',
                name: 'DeepSeek Chat',
                provider: 'deepseek',
                contextWindow: 64000,
                features: ['fast', 'coding', 'chinese-optimized'],
                pricing: { input: 0.14, output: 0.28, unit: 'per-1m-tokens' }
            },
            {
                id: 'deepseek-reasoner',
                name: 'DeepSeek Reasoner',
                provider: 'deepseek',
                contextWindow: 64000,
                features: ['reasoning', 'advanced'],
                pricing: { input: 0.55, output: 2.19, unit: 'per-1m-tokens' }
            }
        ]
    },
    {
        id: 'ollama',
        name: 'Ollama (Local)',
        icon: '🦙',
        requiresApiKey: false,
        baseUrl: 'http://localhost:11434',
        models: [
            {
                id: 'llama3.2',
                name: 'Llama 3.2',
                provider: 'ollama',
                contextWindow: 128000,
                features: ['local', 'privacy']
            },
            {
                id: 'qwen2.5',
                name: 'Qwen 2.5',
                provider: 'ollama',
                contextWindow: 128000,
                features: ['local', 'chinese-optimized']
            },
            {
                id: 'deepseek-coder-v2',
                name: 'DeepSeek Coder V2',
                provider: 'ollama',
                contextWindow: 128000,
                features: ['local', 'coding']
            }
        ]
    }
];

class ModelSelectorService {
    private availableModels: Map<string, Model> = new Map();

    constructor() {
        this.buildModelMap();
    }

    private buildModelMap(): void {
        MODEL_PROVIDERS.forEach(provider => {
            provider.models.forEach(model => {
                this.availableModels.set(model.id, model);
            });
        });
    }

    async showModelSelector(currentModel?: string): Promise<Model | undefined> {
        const quickPickItems: vscode.QuickPickItem[] = [];

        MODEL_PROVIDERS.forEach(provider => {
            quickPickItems.push({
                kind: vscode.QuickPickItemKind.Separator,
                label: `${provider.icon} ${provider.name}`
            });

            provider.models.forEach(model => {
                const isCurrent = model.id === currentModel;
                const tags: string[] = [];

                if (model.recommended) {
                    tags.push('⭐ Recommended');
                }
                if (isCurrent) {
                    tags.push('✓ Current');
                }

                quickPickItems.push({
                    label: `${model.name}`,
                    description: model.id,
                    detail: tags.length > 0 ? tags.join(' • ') : undefined,
                    picked: isCurrent
                });
            });
        });

        const selected = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: 'Select a model',
            matchOnDescription: true
        });

        if (!selected || !selected.description) {
            return;
        }

        return this.availableModels.get(selected.description);
    }

    async showModelConfig(): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'modelSelector',
            'Model Configuration',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = this.getModelConfigHtml();
    }

    private getModelConfigHtml(): string {
        const providerHtml = MODEL_PROVIDERS.map(provider => `
            <div class="provider-section">
                <h2>${provider.icon} ${provider.name}</h2>
                ${provider.requiresApiKey ? `
                    <div class="api-key-section">
                        <label>API Key</label>
                        <input type="password" class="api-key" data-provider="${provider.id}" 
                               placeholder="Enter your API key">
                    </div>
                ` : ''}
                <div class="models-grid">
                    ${provider.models.map(model => `
                        <div class="model-card" data-model="${model.id}">
                            <div class="model-header">
                                <span class="model-name">${model.name}</span>
                                ${model.recommended ? '<span class="badge recommended">Recommended</span>' : ''}
                            </div>
                            <div class="model-info">
                                <span class="context">${(model.contextWindow / 1000).toFixed(0)}K context</span>
                                <span class="features">${model.features.join(', ')}</span>
                            </div>
                            ${model.pricing ? `
                                <div class="pricing">
                                    $${model.pricing.input}/${model.pricing.output} per 1M tokens
                                </div>
                            ` : '<div class="pricing free">Free</div>'}
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Model Configuration</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-editor-foreground);
            background: var(--vscode-editor-background);
        }
        h1 { margin-bottom: 24px; }
        .provider-section {
            margin-bottom: 32px;
            padding: 20px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
        }
        .provider-section h2 {
            margin: 0 0 16px 0;
            font-size: 18px;
        }
        .api-key-section {
            margin-bottom: 16px;
        }
        .api-key-section label {
            display: block;
            margin-bottom: 4px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .api-key {
            width: 100%;
            max-width: 400px;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
        }
        .models-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 12px;
        }
        .model-card {
            padding: 12px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .model-card:hover {
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-editor-inactiveSelectionBackground);
        }
        .model-card.selected {
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-editor-selectionBackground);
        }
        .model-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .model-name {
            font-weight: 500;
        }
        .badge {
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
        }
        .badge.recommended {
            background: #28a74520;
            color: #28a745;
        }
        .model-info {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
        }
        .model-info .context {
            margin-right: 8px;
        }
        .pricing {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .pricing.free {
            color: #28a745;
        }
    </style>
</head>
<body>
    <h1>🧠 Model Configuration</h1>
    <p>Select and configure AI models for your OpenClaw instances.</p>
    
    ${providerHtml}
    
    <script>
        const vscode = acquireVsCodeApi();
        
        document.querySelectorAll('.model-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.model-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                
                vscode.postMessage({
                    command: 'selectModel',
                    modelId: card.dataset.model
                });
            });
        });
    </script>
</body>
</html>`;
    }

    getProviders(): ModelProvider[] {
        return MODEL_PROVIDERS;
    }

    getModel(modelId: string): Model | undefined {
        return this.availableModels.get(modelId);
    }

    getProviderModels(providerId: string): Model[] {
        const provider = MODEL_PROVIDERS.find(p => p.id === providerId);
        return provider?.models || [];
    }

    formatModelInfo(model: Model): string {
        const context = model.contextWindow >= 1000000
            ? `${(model.contextWindow / 1000000).toFixed(1)}M`
            : `${(model.contextWindow / 1000).toFixed(0)}K`;

        let info = `${context} context`;

        if (model.pricing) {
            const isFree = model.pricing.input === 0 && model.pricing.output === 0;
            info += isFree ? ' • Free' : ` • $${model.pricing.input}/$${model.pricing.output} per 1M`;
        }

        return info;
    }

    async configureProviderApiKey(providerId: string): Promise<string | undefined> {
        const provider = MODEL_PROVIDERS.find(p => p.id === providerId);
        if (!provider || !provider.requiresApiKey) {
            return;
        }

        return vscode.window.showInputBox({
            prompt: `Enter API key for ${provider.name}`,
            password: true,
            placeHolder: 'sk-...'
        });
    }

    async addCustomModel(): Promise<Model | undefined> {
        const provider = await vscode.window.showQuickPick(
            MODEL_PROVIDERS.map(p => ({
                label: `${p.icon} ${p.name}`,
                id: p.id
            })),
            { placeHolder: 'Select provider' }
        );

        if (!provider) return;

        const modelId = await vscode.window.showInputBox({
            prompt: 'Enter model ID',
            placeHolder: 'model-name'
        });

        if (!modelId) return;

        const name = await vscode.window.showInputBox({
            prompt: 'Enter display name',
            placeHolder: 'Model Name'
        });

        if (!name) return;

        return {
            id: modelId,
            name,
            provider: provider.id,
            contextWindow: 128000,
            features: ['custom']
        };
    }
}

export const modelSelectorService = new ModelSelectorService();
