import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class UtilService {
    private logChannel: vscode.OutputChannel;
    private logFile: string;

    constructor() {
        this.logChannel = vscode.window.createOutputChannel('OpenClaw Manager');
        this.logFile = path.join(os.homedir(), '.openclaw-manager', 'manager.log');
        
        const logDir = path.dirname(this.logFile);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }

    log(level: LogLevel, message: string, data?: unknown): void {
        const timestamp = new Date().toISOString();
        const dataStr = data ? ` ${JSON.stringify(data)}` : '';
        const logLine = `[${timestamp}] ${level.toUpperCase()}: ${message}${dataStr}`;
        
        this.logChannel.appendLine(logLine);
        fs.appendFileSync(this.logFile, logLine + '\n');
        
        if (level === 'error') {
            this.toast(message, 'error');
        }
    }

    debug(message: string, data?: unknown): void { this.log('debug', message, data); }
    
    info(message: string, data?: unknown): void { this.log('info', message, data); }
    
    warn(message: string, data?: unknown): void { this.log('warn', message, data); }
    
    error(message: string, error?: unknown): void {
        const data = error instanceof Error ? { message: error.message, stack: error.stack } : error;
        this.log('error', message, data);
    }

    showLogs(): void {
        this.logChannel.show();
    }

    async notify(message: string, ...items: string[]): Promise<string | undefined> {
        return vscode.window.showInformationMessage(`🦞 ${message}`, ...items);
    }

    async warnDialog(message: string, ...items: string[]): Promise<string | undefined> {
        return vscode.window.showWarningMessage(`🦞 ${message}`, ...items);
    }

    async errorDialog(message: string, ...items: string[]): Promise<string | undefined> {
        return vscode.window.showErrorMessage(`🦞 ${message}`, ...items);
    }

    toast(message: string, type: 'info' | 'warn' | 'error' = 'info'): void {
        const icons = { info: '✓', warn: '⚠', error: '✗' };
        vscode.window.setStatusBarMessage(`${icons[type]} ${message}`, 3000);
    }

    async withProgress<T>(title: string, task: () => Promise<T>): Promise<T> {
        return vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title },
            async () => task()
        );
    }

    async input(prompt: string, options?: { placeholder?: string; value?: string; password?: boolean }): Promise<string | undefined> {
        return vscode.window.showInputBox({
            prompt,
            placeHolder: options?.placeholder,
            value: options?.value,
            password: options?.password
        });
    }

    async pick<T extends vscode.QuickPickItem>(items: T[], options?: vscode.QuickPickOptions): Promise<T | undefined> {
        return vscode.window.showQuickPick(items, options);
    }

    async pickMany<T extends vscode.QuickPickItem>(items: T[], options?: vscode.QuickPickOptions): Promise<T[] | undefined> {
        return vscode.window.showQuickPick(items, { ...options, canPickMany: true });
    }

    async confirm(message: string, confirmText = 'Confirm'): Promise<boolean> {
        const result = await vscode.window.showWarningMessage(message, confirmText, 'Cancel');
        return result === confirmText;
    }

    async saveFile(defaultName: string, content: string): Promise<string | undefined> {
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(defaultName),
            filters: { 'JSON Files': ['json'] }
        });
        
        if (uri) {
            fs.writeFileSync(uri.fsPath, content);
            return uri.fsPath;
        }
        return;
    }

    async openFile(filters: Record<string, string[]>): Promise<string | undefined> {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters
        });
        return uris?.[0]?.fsPath;
    }

    formatBytes(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    formatDate(date: Date): string {
        return date.toLocaleString();
    }

    dispose(): void {
        this.logChannel.dispose();
    }
}

export const util = new UtilService();
