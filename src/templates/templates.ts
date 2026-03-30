export interface InstanceTemplate {
    id: string;
    name: string;
    description: string;
    category: 'basic' | 'development' | 'production' | 'specialized';
    icon: string;
    config: {
        gateway?: Record<string, unknown>;
        agents?: Record<string, unknown>;
        channels?: Record<string, unknown>;
        models?: Record<string, unknown>;
        tools?: Record<string, unknown>;
    };
    channels?: string[];
    tags: string[];
}

export const templates: InstanceTemplate[] = [
    {
        id: 'basic',
        name: 'Basic Shrimp',
        description: 'Simple OpenClaw instance with default settings',
        category: 'basic',
        icon: '🦞',
        config: {
            gateway: {
                mode: 'local',
                bind: 'loopback'
            },
            agents: {
                list: [{ id: 'main' }]
            }
        },
        tags: ['basic', 'default']
    },
    {
        id: 'developer',
        name: 'Developer Shrimp',
        description: 'Configured for coding assistance with exec permissions',
        category: 'development',
        icon: '💻',
        config: {
            gateway: {
                mode: 'local',
                bind: 'loopback'
            },
            agents: {
                defaults: {
                    workspace: '${workspace}',
                    maxConcurrent: 4
                },
                list: [{ id: 'main' }]
            },
            tools: {
                profile: 'coding'
            }
        },
        tags: ['development', 'coding', 'programming']
    },
    {
        id: 'chatbot',
        name: 'Chatbot Shrimp',
        description: 'Optimized for conversational AI with messaging channels',
        category: 'production',
        icon: '💬',
        config: {
            gateway: {
                mode: 'local'
            },
            agents: {
                defaults: {
                    maxConcurrent: 10
                },
                list: [{ id: 'main' }]
            },
            tools: {
                profile: 'messaging'
            }
        },
        channels: ['feishu', 'dingtalk'],
        tags: ['chatbot', 'messaging', 'production']
    },
    {
        id: 'research',
        name: 'Research Shrimp',
        description: 'Configured for research with web search and memory',
        category: 'specialized',
        icon: '🔍',
        config: {
            gateway: {
                mode: 'local'
            },
            agents: {
                defaults: {
                    memorySearch: {
                        enabled: true,
                        provider: 'local'
                    }
                },
                list: [{ id: 'main' }]
            },
            tools: {
                web: {
                    search: { enabled: true },
                    fetch: { enabled: true }
                }
            }
        },
        tags: ['research', 'web', 'search']
    },
    {
        id: 'content-creator',
        name: 'Content Creator Shrimp',
        description: 'For content creation with writing and publishing tools',
        category: 'specialized',
        icon: '✍️',
        config: {
            gateway: {
                mode: 'local'
            },
            agents: {
                defaults: {
                    maxConcurrent: 2
                },
                list: [{ id: 'main' }]
            },
            tools: {
                profile: 'coding'
            }
        },
        tags: ['content', 'writing', 'creative']
    },
    {
        id: 'automation',
        name: 'Automation Shrimp',
        description: 'For scheduled tasks and automation workflows',
        category: 'specialized',
        icon: '🤖',
        config: {
            gateway: {
                mode: 'local'
            },
            agents: {
                defaults: {
                    heartbeat: {
                        every: '5m',
                        includeReasoning: false
                    }
                },
                list: [{ id: 'main' }]
            }
        },
        tags: ['automation', 'scheduled', 'tasks']
    },
    {
        id: 'secure',
        name: 'Secure Shrimp',
        description: 'Maximum security with restricted permissions',
        category: 'production',
        icon: '🔒',
        config: {
            gateway: {
                mode: 'local',
                bind: 'loopback',
                auth: {
                    mode: 'token'
                }
            },
            agents: {
                defaults: {
                    maxConcurrent: 2,
                    subagents: {
                        maxConcurrent: 2,
                        maxSpawnDepth: 1
                    }
                },
                list: [{ id: 'main' }]
            },
            tools: {
                profile: 'messaging',
                deny: ['tts', 'exec']
            }
        },
        tags: ['security', 'production', 'restricted']
    },
    {
        id: 'high-performance',
        name: 'High Performance Shrimp',
        description: 'Optimized for high throughput with parallel processing',
        category: 'production',
        icon: '⚡',
        config: {
            gateway: {
                mode: 'local'
            },
            agents: {
                defaults: {
                    maxConcurrent: 16,
                    subagents: {
                        maxConcurrent: 8,
                        maxSpawnDepth: 3,
                        maxChildrenPerAgent: 16
                    }
                },
                list: [{ id: 'main' }]
            }
        },
        tags: ['performance', 'parallel', 'high-throughput']
    }
];

export function getTemplate(id: string): InstanceTemplate | undefined {
    return templates.find(t => t.id === id);
}

export function getTemplatesByCategory(category: InstanceTemplate['category']): InstanceTemplate[] {
    return templates.filter(t => t.category === category);
}

export function getTemplatesByTag(tag: string): InstanceTemplate[] {
    return templates.filter(t => t.tags.includes(tag));
}
