declare global { interface Window { siteConfirm(text: string): Promise<boolean>; sitePrompt(text: string, value?: string): Promise<string | null>; siteAlert(text: string): void } }
export {}
