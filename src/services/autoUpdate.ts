import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { IncomingMessage } from 'http';

interface ReleaseInfo {
    version: string;
    tagName: string;
    downloadUrl: string;
    releaseNotes: string;
    publishedAt: string;
}

class AutoUpdateService {
    private context: vscode.ExtensionContext;
    private readonly GITHUB_REPO = 'openclaw/openclaw-manager';
    private readonly API_URL = `https://api.github.com/repos/${this.GITHUB_REPO}/releases/latest`;
    private updateCheckInterval?: NodeJS.Timeout;
    private _onUpdateAvailable = new vscode.EventEmitter<ReleaseInfo>();
    readonly onUpdateAvailable = this._onUpdateAvailable.event;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    async checkForUpdate(showMessage: boolean = false): Promise<ReleaseInfo | null> {
        try {
            const currentVersion = this.getCurrentVersion();
            const latestRelease = await this.fetchLatestRelease();

            if (!latestRelease) {
                if (showMessage) {
                    vscode.window.showInformationMessage('Unable to check for updates');
                }
                return null;
            }

            const latestVersion = latestRelease.version;

            if (this.compareVersions(latestVersion, currentVersion) > 0) {
                this._onUpdateAvailable.fire(latestRelease);
                return latestRelease;
            }

            if (showMessage) {
                vscode.window.showInformationMessage(
                    `OpenClaw Manager is up to date (${currentVersion})`
                );
            }

            return null;
        } catch (err) {
            if (showMessage) {
                vscode.window.showErrorMessage(`Update check failed: ${err}`);
            }
            return null;
        }
    }

    private getCurrentVersion(): string {
        const packageJson = require('../../package.json');
        return packageJson.version;
    }

    private async fetchLatestRelease(): Promise<ReleaseInfo | null> {
        return new Promise((resolve, reject) => {
            const options = {
                headers: {
                    'User-Agent': 'OpenClaw-Manager-VSCode',
                    'Accept': 'application/vnd.github.v3+json'
                }
            };

            https.get(this.API_URL, options, (res: IncomingMessage) => {
                let data = '';

                res.on('data', chunk => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const release = JSON.parse(data);
                        
                        if (release.message === 'Not Found') {
                            resolve(null);
                            return;
                        }

                        const asset = release.assets?.find(
                            (a: { name: string }) => a.name.endsWith('.vsix')
                        );

                        resolve({
                            version: release.tag_name?.replace(/^v/, '') || '0.0.0',
                            tagName: release.tag_name,
                            downloadUrl: asset?.browser_download_url || '',
                            releaseNotes: release.body || '',
                            publishedAt: release.published_at
                        });
                    } catch {
                        reject(new Error('Failed to parse release info'));
                    }
                });
            }).on('error', reject);
        });
    }

    private compareVersions(a: string, b: string): number {
        const partsA = a.split('.').map(Number);
        const partsB = b.split('.').map(Number);

        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
            const partA = partsA[i] || 0;
            const partB = partsB[i] || 0;

            if (partA > partB) return 1;
            if (partA < partB) return -1;
        }

        return 0;
    }

    async downloadAndInstall(release: ReleaseInfo): Promise<void> {
        if (!release.downloadUrl) {
            throw new Error('No download URL available');
        }

        const downloadDir = path.join(os.tmpdir(), 'openclaw-manager-update');
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }

        const vsixPath = path.join(downloadDir, `openclaw-manager-${release.version}.vsix`);

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Downloading OpenClaw Manager Update',
                cancellable: false
            },
            async progress => {
                progress.report({ message: 'Downloading...' });

                await this.downloadFile(release.downloadUrl, vsixPath, progress);

                progress.report({ message: 'Installing...' });

                // Install the extension
                await vscode.commands.executeCommand(
                    'workbench.extensions.installExtension',
                    vscode.Uri.file(vsixPath)
                );

                progress.report({ message: 'Complete!' });
            }
        );

        const action = await vscode.window.showInformationMessage(
            `OpenClaw Manager updated to ${release.version}. Restart VS Code to apply the update.`,
            'Restart Now',
            'Later'
        );

        if (action === 'Restart Now') {
            vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
    }

    private downloadFile(
        url: string,
        dest: string,
        progress: vscode.Progress<{ message?: string; increment?: number }>
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(dest);
            let downloaded = 0;
            let totalSize = 0;

            https.get(url, (response) => {
                // Handle redirects
                if (response.statusCode === 302 || response.statusCode === 301) {
                    const redirectUrl = response.headers.location;
                    if (redirectUrl) {
                        this.downloadFile(redirectUrl, dest, progress)
                            .then(resolve)
                            .catch(reject);
                        return;
                    }
                }

                totalSize = parseInt(response.headers['content-length'] || '0', 10);

                response.on('data', chunk => {
                    downloaded += chunk.length;
                    if (totalSize > 0) {
                        const percent = Math.round((downloaded / totalSize) * 100);
                        progress.report({
                            message: `Downloading... ${percent}%`,
                            increment: (chunk.length / totalSize) * 100
                        });
                    }
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', err => {
                fs.unlinkSync(dest);
                reject(err);
            });
        });
    }

    async showUpdateDialog(release: ReleaseInfo): Promise<void> {
        const action = await vscode.window.showInformationMessage(
            `OpenClaw Manager ${release.version} is available. ${this.getReleaseSummary(release)}`,
            'Update Now',
            'View Release Notes',
            'Later'
        );

        switch (action) {
            case 'Update Now':
                await this.downloadAndInstall(release);
                break;
            case 'View Release Notes':
                vscode.env.openExternal(
                    vscode.Uri.parse(`https://github.com/${this.GITHUB_REPO}/releases/tag/${release.tagName}`)
                );
                break;
        }
    }

    private getReleaseSummary(release: ReleaseInfo): string {
        const lines = release.releaseNotes.split('\n').filter(l => l.trim());
        const features = lines.filter(l => 
            l.includes('### Added') || 
            l.includes('### Fixed') ||
            l.includes('### Changed')
        ).slice(0, 3);

        if (features.length > 0) {
            return features.join('. ');
        }

        return '';
    }

    startBackgroundCheck(intervalMs: number = 24 * 60 * 60 * 1000): void {
        // Check on startup
        this.checkForUpdate(false);

        // Then check periodically
        this.updateCheckInterval = setInterval(() => {
            this.checkForUpdate(false);
        }, intervalMs);
    }

    stopBackgroundCheck(): void {
        if (this.updateCheckInterval) {
            clearInterval(this.updateCheckInterval);
        }
    }

    getLastCheckTime(): Date | undefined {
        return this.context.globalState.get<Date>('lastUpdateCheck');
    }

    setLastCheckTime(date: Date): void {
        this.context.globalState.update('lastUpdateCheck', date.toISOString());
    }
}

export const autoUpdateService = AutoUpdateService;
