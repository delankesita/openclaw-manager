import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import archiver from 'archiver';
import extract from 'extract-zip';

export interface BackupInfo {
    id: string;
    instanceId: string;
    instanceName: string;
    description?: string;
    createdAt: Date;
    size: number;
    path: string;
}

class BackupService {
    private backupDir: string;
    private backupsFile: string;
    private backups: Map<string, BackupInfo> = new Map();

    constructor() {
        this.backupDir = path.join(
            vscode.workspace.getConfiguration('openclawManager').get('backupDir', '~/.openclaw-manager/backups').replace('~', os.homedir())
        );
        this.backupsFile = path.join(this.backupDir, 'backups.json');
        
        this.ensureBackupDir();
        this.loadBackups();
    }

    private ensureBackupDir(): void {
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }
    }

    private loadBackups(): void {
        if (fs.existsSync(this.backupsFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.backupsFile, 'utf-8'));
                Object.entries(data).forEach(([id, info]) => {
                    this.backups.set(id, {
                        ...(info as BackupInfo),
                        createdAt: new Date((info as BackupInfo).createdAt)
                    });
                });
            } catch {
                // Ignore parse errors
            }
        }
    }

    private saveBackups(): void {
        const data: Record<string, BackupInfo> = {};
        this.backups.forEach((info, id) => {
            data[id] = info;
        });
        fs.writeFileSync(this.backupsFile, JSON.stringify(data, null, 2));
    }

    async createBackup(
        instanceId: string,
        instanceName: string,
        stateDir: string,
        description?: string
    ): Promise<string> {
        const id = `${instanceId}-${Date.now()}`;
        const backupPath = path.join(this.backupDir, `${id}.zip`);

        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(backupPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', () => {
                const size = archive.pointer();
                const info: BackupInfo = {
                    id,
                    instanceId,
                    instanceName,
                    description,
                    createdAt: new Date(),
                    size,
                    path: backupPath
                };

                this.backups.set(id, info);
                this.saveBackups();

                resolve(id);
            });

            archive.on('error', reject);
            archive.pipe(output);

            // Add state directory
            if (fs.existsSync(stateDir)) {
                archive.directory(stateDir, false);
            }

            archive.finalize();
        });
    }

    async restoreBackup(backupId: string, targetDir: string): Promise<void> {
        const backup = this.backups.get(backupId);
        if (!backup) {
            throw new Error(`Backup not found: ${backupId}`);
        }

        if (!fs.existsSync(backup.path)) {
            throw new Error(`Backup file not found: ${backup.path}`);
        }

        // Clear target directory
        if (fs.existsSync(targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
        }
        fs.mkdirSync(targetDir, { recursive: true });

        // Extract backup
        await extract(backup.path, { dir: targetDir });
    }

    deleteBackup(backupId: string): void {
        const backup = this.backups.get(backupId);
        if (!backup) return;

        if (fs.existsSync(backup.path)) {
            fs.unlinkSync(backup.path);
        }

        this.backups.delete(backupId);
        this.saveBackups();
    }

    getBackups(): BackupInfo[] {
        return Array.from(this.backups.values()).sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        );
    }

    getBackupsForInstance(instanceId: string): BackupInfo[] {
        return this.getBackups().filter(b => b.instanceId === instanceId);
    }

    getBackup(backupId: string): BackupInfo | undefined {
        return this.backups.get(backupId);
    }

    formatSize(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    cleanupOldBackups(maxAge: number = 30 * 24 * 60 * 60 * 1000): number {
        const now = Date.now();
        let cleaned = 0;

        this.backups.forEach((backup, id) => {
            if (now - backup.createdAt.getTime() > maxAge) {
                this.deleteBackup(id);
                cleaned++;
            }
        });

        return cleaned;
    }

    async showBackupManager(instanceId?: string): Promise<void> {
        const backups = instanceId 
            ? this.getBackupsForInstance(instanceId)
            : this.getBackups();

        if (backups.length === 0) {
            vscode.window.showInformationMessage('No backups available');
            return;
        }

        const items = backups.map(b => ({
            label: `$(package) ${b.instanceName} - ${b.createdAt.toLocaleString()}`,
            description: this.formatSize(b.size),
            detail: b.description || 'No description',
            id: b.id
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a backup to manage'
        });

        if (!selected) return;

        const action = await vscode.window.showQuickPick(
            [
                { label: '$(cloud-download) Restore', action: 'restore' },
                { label: '$(trash) Delete', action: 'delete' },
                { label: '$(folder) Open in Explorer', action: 'open' }
            ],
            { placeHolder: 'Choose action' }
        );

        if (!action) return;

        const backup = this.backups.get(selected.id);
        if (!backup) return;

        switch (action.action) {
            case 'restore':
                // This will be handled by the manager
                break;
            case 'delete':
                this.deleteBackup(selected.id);
                vscode.window.showInformationMessage('Backup deleted');
                break;
            case 'open':
                vscode.env.openExternal(vscode.Uri.file(path.dirname(backup.path)));
                break;
        }
    }
}

export const backupService = new BackupService();
