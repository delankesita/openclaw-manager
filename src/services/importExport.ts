import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';
import { notification } from './notification';
import { InstanceConfig } from '../models/instance';

export interface ExportData {
    version: string;
    exportedAt: string;
    instances: InstanceConfig[];
    settings?: Record<string, unknown>;
}

class ImportExportService {
    private currentVersion = '1.0.0';

    async exportInstances(
        instances: InstanceConfig[],
        filePath?: string
    ): Promise<string> {
        const exportData: ExportData = {
            version: this.currentVersion,
            exportedAt: new Date().toISOString(),
            instances
        };

        if (!filePath) {
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(
                    `openclaw-instances-${new Date().toISOString().split('T')[0]}.json`
                ),
                filters: {
                    'JSON Files': ['json']
                }
            });

            if (!uri) {
                throw new Error('Export cancelled');
            }

            filePath = uri.fsPath;
        }

        fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2));
        logger.info(`Exported ${instances.length} instances to ${filePath}`);

        return filePath;
    }

    async importInstances(
        filePath?: string
    ): Promise<InstanceConfig[]> {
        if (!filePath) {
            const uris = await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: {
                    'JSON Files': ['json']
                }
            });

            if (!uris || uris.length === 0) {
                throw new Error('Import cancelled');
            }

            filePath = uris[0].fsPath;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const data: ExportData = JSON.parse(content);

        // Validate version compatibility
        if (!this.isCompatibleVersion(data.version)) {
            throw new Error(
                `Incompatible export version: ${data.version}. Current version: ${this.currentVersion}`
            );
        }

        logger.info(`Imported ${data.instances.length} instances from ${filePath}`);
        return data.instances;
    }

    async exportInstance(
        instance: InstanceConfig,
        includeSecrets: boolean = false
    ): Promise<string> {
        const exportData = {
            version: this.currentVersion,
            exportedAt: new Date().toISOString(),
            instance: this.sanitizeInstance(instance, includeSecrets)
        };

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`${instance.name}-config.json`),
            filters: {
                'JSON Files': ['json']
            }
        });

        if (!uri) {
            throw new Error('Export cancelled');
        }

        fs.writeFileSync(uri.fsPath, JSON.stringify(exportData, null, 2));
        logger.info(`Exported instance ${instance.name} to ${uri.fsPath}`);

        return uri.fsPath;
    }

    async importInstance(
        filePath?: string
    ): Promise<InstanceConfig> {
        if (!filePath) {
            const uris = await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: {
                    'JSON Files': ['json']
                }
            });

            if (!uris || uris.length === 0) {
                throw new Error('Import cancelled');
            }

            filePath = uris[0].fsPath;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);

        if (!data.instance) {
            throw new Error('Invalid export file: missing instance data');
        }

        logger.info(`Imported instance from ${filePath}`);
        return data.instance;
    }

    private isCompatibleVersion(version: string): boolean {
        const [major] = version.split('.');
        const [currentMajor] = this.currentVersion.split('.');
        return major === currentMajor;
    }

    private sanitizeInstance(
        instance: InstanceConfig,
        includeSecrets: boolean
    ): InstanceConfig {
        const sanitized = { ...instance };

        if (!includeSecrets) {
            // Remove sensitive data
            if (sanitized.channels) {
                for (const channel of Object.keys(sanitized.channels)) {
                    const config = sanitized.channels[channel] as Record<string, unknown>;
                    if (config) {
                        delete config.appSecret;
                        delete config.clientSecret;
                        delete config.apiKey;
                        delete config.token;
                    }
                }
            }
        }

        return sanitized;
    }

    async shareInstance(instance: InstanceConfig): Promise<string> {
        // Generate shareable configuration
        const shareData = {
            name: instance.name,
            model: instance.model,
            channels: Object.keys(instance.channels || {}),
            config: this.sanitizeInstance(instance, false)
        };

        const shareCode = Buffer.from(
            JSON.stringify(shareData)
        ).toString('base64');

        await vscode.env.clipboard.writeText(shareCode);
        await notification.info('Share code copied to clipboard!');

        return shareCode;
    }

    async importFromShareCode(code: string): Promise<InstanceConfig> {
        try {
            const data = JSON.parse(
                Buffer.from(code, 'base64').toString('utf-8')
            );
            return data.config;
        } catch (err) {
            throw new Error('Invalid share code');
        }
    }
}

export const importExportService = new ImportExportService();
