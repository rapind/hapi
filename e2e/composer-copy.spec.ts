import { expect, test } from '@playwright/test'

/** Check conversation copying and native textarea draft selection. */
test.describe('composer Ctrl+A + Ctrl+C copy', () => {
    test.beforeEach(async ({ context, page }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write'])
        await page.goto('/e2e-fixtures/composer-copy-fixture.html')
        await page.getByRole('textbox').waitFor()
    })

    test('keeps the empty caret line visible and hides scrollbars without disabling long-draft scrolling', async ({
        page
    }) => {
        const editor = page.getByRole('textbox')
        await editor.focus()
        await expect(editor).toBeFocused()
        await expect(editor).toHaveAttribute('rows', '1')
        const empty = await editor.evaluate((element: HTMLTextAreaElement) => {
            const style = getComputedStyle(element)
            return {
                height: element.clientHeight,
                lineHeight: parseFloat(style.lineHeight),
                caretColor: style.caretColor,
                color: style.color,
                scrollbarWidth: style.scrollbarWidth,
                webkitScrollbar: getComputedStyle(element, '::-webkit-scrollbar').display
            }
        })
        expect(empty.height).toBeGreaterThanOrEqual(empty.lineHeight)
        expect(empty.caretColor).toBe(empty.color)
        expect(empty.caretColor).not.toBe('rgba(0, 0, 0, 0)')
        expect(empty.scrollbarWidth).toBe('none')
        expect(empty.webkitScrollbar).toBe('none')

        await editor.fill(Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join('\n'))
        const long = await editor.evaluate((element: HTMLTextAreaElement) => {
            element.scrollTop = element.scrollHeight
            return { height: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop }
        })
        expect(long.height).toBeGreaterThan(empty.height)
        expect(long.scrollHeight).toBeGreaterThan(long.height)
        expect(long.scrollTop).toBeGreaterThan(0)
        await editor.fill('')
        await expect(editor).toBeFocused()
    })

    test('Ctrl+A outside the composer selects the message thread and Ctrl+C copies it', async ({ page }) => {
        await page.keyboard.press('ControlOrMeta+a')
        const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '')
        expect(selected).toContain('The quick brown fox jumps over the lazy dog')
        expect(selected).toContain('my earlier user message')
        await page.keyboard.press('ControlOrMeta+c')
        const copied = await page.evaluate(() => navigator.clipboard.readText())
        expect(copied).toBe(selected)
    })

    test('preserves an earlier word selection across control updates without refocusing', async ({ page }) => {
        const editor = page.getByRole('textbox')
        await editor.fill('we can apply it')
        await editor.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(3, 6))
        await page.evaluate(() => window.__composerCopyE2E!.setDisabled(true))
        await page.locator('[data-testid="assistant-message-1"]').click()
        await page.evaluate(() => window.__composerCopyE2E!.setDisabled(false))
        await expect(editor).toBeEnabled()
        await expect(editor).not.toBeFocused()
        expect(
            await editor.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd])
        ).toEqual([3, 6])
    })

    test('keeps typing at an earlier word instead of moving the caret to the end', async ({ page }) => {
        const editor = page.getByRole('textbox')
        await editor.fill('we can apply it')
        await editor.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(3, 6))
        await page.keyboard.type('could')
        await expect(editor).toHaveValue('we could apply it')
        expect(await page.evaluate(() => window.__composerCopyE2E!.getValue())).toBe('we could apply it')
        expect(await editor.evaluate((element: HTMLTextAreaElement) => element.selectionStart)).toBe(8)
    })

    test('reflects restored and cleared runtime drafts in the input', async ({ page }) => {
        const editor = page.getByRole('textbox')
        await editor.fill('local draft')
        await page.evaluate(() => window.__composerCopyE2E!.setValue('restored draft'))
        await expect(editor).toHaveValue('restored draft')
        await page.evaluate(() => window.__composerCopyE2E!.setValue(''))
        await expect(editor).toHaveValue('')
    })

    test('Ctrl+A with composer focused still selects only the composer draft', async ({ page }) => {
        const editor = page.getByRole('textbox')
        await editor.click()
        await page.keyboard.type('my draft message')
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.press('ControlOrMeta+c')
        const copied = await page.evaluate(() => navigator.clipboard.readText())
        expect(copied).toBe('my draft message')
    })

    test('Ctrl+A in a textarea keeps native behavior', async ({ page }) => {
        await page.evaluate(() => {
            const textarea = document.createElement('textarea')
            textarea.id = 'plain-textarea'
            textarea.value = 'textarea draft'
            document.body.appendChild(textarea)
        })
        const textarea = page.locator('#plain-textarea')
        await textarea.click()
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.press('ControlOrMeta+c')
        const copied = await page.evaluate(() => navigator.clipboard.readText())
        expect(copied).toBe('textarea draft')
    })

    test('mouse-drag selection still copies via plain Ctrl+C', async ({ page }) => {
        const msg = page.locator('[data-testid="assistant-message-2"]')
        await msg.dragTo(page.locator('[data-testid="user-message-1"]'), {
            sourcePosition: { x: 0, y: 2 },
            targetPosition: { x: 300, y: 2 }
        })
        await page.keyboard.press('ControlOrMeta+c')
        const copied = await page.evaluate(() => navigator.clipboard.readText())
        expect(copied).toContain('Another assistant message')
        expect(copied).toContain('my earlier user message')
    })
})
