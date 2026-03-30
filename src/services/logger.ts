import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    message: string;
    data?: unknown;
}

class Logger {
    private logDir: string;
    private logFile: string;
    private logChannel: vscode.OutputChannel;
    private maxLogSize = 5 * 1024 * 1024; // 5MB
    private maxLogFiles = 5;

    constructor() {
        this.logDir = path.join(os.homedir(), '.openclaw-manager', 'logs');
        this.logFile = path.join(this.logDir, 'manager.log');
        this.logChannel = vscode.window.createOutputChannel('OpenClaw Manager');
        
        this.ensureLogDir();
        this.rotateLogs();
    }

    private ensureLogDir(): void {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    private rotateLogs(): void {
        if (!fs.existsSync(this.logFile)) {
            return;
        }

        const stats = fs.statSync(this.logFile);
        if (stats.size < this.maxLogSize) {
            return;
        }

        // Rotate existing logs
        for (let i = this.maxLogFiles - 1; i >= 1; i--) {
            const oldFile = path.join(this.logDir, `manager.log.${i}`);
            const newFile = path.join(this.logDir, `manager.log.${i + 1}`);
            
            if (fs.existsSync(oldFile)) {
                if (i === this.maxLogFiles - 1) {
                    fs.unlinkSync(oldFile);
                } else {
                    fs.renameSync(oldFile, newFile);
                }
            }
        }

        fs.renameSync(this.logFile, path.join(this.logDir, 'manager.log.1'));
    }

    private formatEntry(entry: LogEntry): string {
        const timestamp = entry.timestamp.toISOString();
        const data = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
        return `[${timestamp}] ${entry.level.toUpperCase()}: ${entry.message}${data}\n`;
    }

    private write(entry: LogEntry): void {
        const formatted = this.formatEntry(entry);
        
        // Write to file
        fs.appendFileSync(this.logFile, formatted);
        
        // Write to output channel
        this.logChannel.appendLine(formatted.trim());
        
        // Show in status bar for errors
        if (entry.level === 'error') {
            vscode.window.setStatusBarMessage(`$(error) ${entry.message}`, 5000);
        }
    }

    debug(message: string, data?: unknown): void {
        this.write({ timestamp: new Date(), level: 'debug', message, data });
    }

    info(message: string, data?: unknown): void {
        this.write({ timestamp: new Date(), level: 'info', message, data });
    }

    warn(message: string, data?: unknown): void {
        this.write({ timestamp: new Date(), level: 'warn', message, data });
    }

    error(message: string, error?: unknown): void {
        const data = error instanceof Error 
            ? { message: error.message, stack: error.stack }
            : error;
        this.write({ timestamp: new Date(), level: 'error', message, data });
    }

    show(): void {
        this.logChannel.show();
    }

    clear(): void {
        this.logChannel.clear();
        if (fs.existsSync(this.logFile)) {
            fs.writeFileSync(this.logFile, '');
        }
    }

    getLogPath(): string {
        return this.logFile;
    }

    getRecentLogs(lines: number = 100): string[] {
        if (!fs.existsSync(this.logFile)) {
            return [];
        }

        const content = fs.readFileSync(this.logFile, 'utf-8');
        const allLines = content.split('\n').filter(Boolean);
        return allLines.slice(-lines);
    }

    dispose(): void {
        this.logChannel.dispose();
    }
}

export const logger = new Logger();
