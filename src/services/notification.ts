import * as vscode from 'vscode';

class NotificationService {
    private readonly extensionName = 'OpenClaw Manager';

    async info(message: string, ...items: string[]): Promise<string | undefined> {
        if (items.length > 0) {
            return vscode.window.showInformationMessage(
                `${this.extensionName}: ${message}`,
                ...items
            );
        }
        vscode.window.showInformationMessage(`${this.extensionName}: ${message}`);
        return undefined;
    }

    async warning(message: string, ...items: string[]): Promise<string | undefined> {
        if (items.length > 0) {
            return vscode.window.showWarningMessage(
                `${this.extensionName}: ${message}`,
                ...items
            );
        }
        vscode.window.showWarningMessage(`${this.extensionName}: ${message}`);
        return undefined;
    }

    async error(message: string, ...items: string[]): Promise<string | undefined> {
        if (items.length > 0) {
            return vscode.window.showErrorMessage(
                `${this.extensionName}: ${message}`,
                ...items
            );
        }
        vscode.window.showErrorMessage(`${this.extensionName}: ${message}`);
        return undefined;
    }

    async progress<T>(
        message: string,
        task: (
            progress: vscode.Progress<{ message?: string; increment?: number }>,
            token: vscode.CancellationToken
        ) => Thenable<T>
    ): Promise<T> {
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `${this.extensionName}`,
                cancellable: false
            },
            async (progress, token) => {
                progress.report({ message });
                return task(progress, token);
            }
        );
    }

    async progressWithSteps<T>(
        title: string,
        steps: { message: string; action: () => Thenable<T> }[]
    ): Promise<void> {
        const totalSteps = steps.length;
        
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `${this.extensionName}: ${title}`,
                cancellable: false
            },
            async (progress) => {
                for (let i = 0; i < steps.length; i++) {
                    const step = steps[i];
                    progress.report({
                        message: step.message,
                        increment: (100 / totalSteps)
                    });
                    await step.action();
                }
            }
        );
    }

    toast(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
        const icon = {
            info: '$(check)',
            warning: '$(alert)',
            error: '$(error)'
        }[type];

        vscode.window.setStatusBarMessage(`${icon} ${message}`, 3000);
    }

    async confirm(
        message: string,
        confirmText: string = 'Confirm',
        cancelText: string = 'Cancel'
    ): Promise<boolean> {
        const result = await vscode.window.showWarningMessage(
            `${this.extensionName}: ${message}`,
            confirmText,
            cancelText
        );
        return result === confirmText;
    }

    async promptInput(
        message: string,
        options?: {
            placeHolder?: string;
            value?: string;
            password?: boolean;
            validateInput?: (value: string) => string | undefined;
        }
    ): Promise<string | undefined> {
        return vscode.window.showInputBox({
            prompt: message,
            placeHolder: options?.placeHolder,
            value: options?.value,
            password: options?.password,
            validateInput: options?.validateInput
        });
    }

    async promptPick<T extends vscode.QuickPickItem>(
        items: T[],
        options?: vscode.QuickPickOptions
    ): Promise<T | undefined> {
        return vscode.window.showQuickPick(items, options);
    }

    async promptMultiPick<T extends vscode.QuickPickItem>(
        items: T[],
        options?: vscode.QuickPickOptions
    ): Promise<T[] | undefined> {
        return vscode.window.showQuickPick(items, {
            ...options,
            canPickMany: true
        });
    }
}

export const notification = new NotificationService();
