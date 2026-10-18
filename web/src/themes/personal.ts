import type { ColorScheme } from '@/hooks/useColorTheme'

/** Personal palette. Layout and typography belong to the chat components. */
export function getPersonalThemeColors(scheme: ColorScheme): Record<string, string> {
    const dark = scheme !== 'light'
    const canvas = scheme === 'oled' ? '#080808' : dark ? '#141414' : '#faf9f5'
    const sidebar = scheme === 'oled' ? '#050505' : dark ? '#101010' : '#f1f0eb'
    const surface = dark ? '#212121' : '#eeede9'
    const text = dark ? '#edede9' : '#353530'
    const chromeText = dark ? '#d8d7d2' : '#353530'
    const muted = dark ? '#85847e' : '#67665f'
    const border = dark ? '#373737' : '#ddd6d0'
    const hover = dark ? '#303030' : '#e9e8e2'
    const composer = scheme === 'oled' ? '#1b1b1b' : dark ? '#202020' : '#f0efeb'
    return {
        '--app-bg': canvas,
        '--app-fg': text,
        '--app-hint': muted,
        '--app-link': dark ? '#d97876' : '#9f4543',
        '--app-link-muted': dark ? '#6c4140' : '#d8b1af',
        '--app-button': chromeText,
        '--app-button-text': canvas,
        '--app-banner-bg': surface,
        '--app-banner-text': text,
        '--app-secondary-bg': surface,
        '--app-dialog-bg': composer,
        '--app-chat-message-fg': text,
        '--app-chat-message-bg': surface,
        '--app-sidebar-bg': sidebar,
        '--app-chat-header-bg': canvas,
        '--app-chat-header-fg': chromeText,
        '--app-composer-fg': chromeText,
        '--app-composer-bg': composer,
        '--app-chat-user-bg': surface,
        '--app-chat-user-fg': text,
        '--app-chat-user-chip-bg': surface,
        '--app-chat-user-chip-fg': chromeText,
        '--app-chat-user-chip-action-bg': surface,
        '--app-chat-user-chip-action-fg': muted,
        '--app-chat-user-chip-action-hover-fg': chromeText,
        '--app-tool-card-bg': surface,
        '--app-tool-card-title': muted,
        '--app-tool-card-hover-bg': hover,
        '--app-tool-card-accent': muted,
        '--app-tool-card-muted-action-fg': muted,
        '--app-tool-card-subtitle': muted,
        '--app-code-header-bg': surface,
        '--app-code-header-fg': muted,
        '--app-code-bg': surface,
        '--app-inline-code-bg': surface,
        '--app-inline-code-fg': dark ? '#d97876' : '#9f4543',
        '--app-inline-code-border': border,
        '--app-md-quote-bg': surface,
        '--app-md-quote-border': border,
        '--app-md-quote-fg': muted,
        '--app-md-table-bg': surface,
        '--app-md-table-head-bg': hover,
        '--app-reasoning-bg': surface,
        '--app-border': border,
        '--app-divider': border,
        '--app-subtle-bg': dark ? '#ffffff0d' : '#0000000a',
        '--app-scrollbar-thumb': dark ? '#85847e60' : '#67665f60',
        '--app-scrollbar-thumb-hover': dark ? '#85847e90' : '#67665f90',
    }
}
