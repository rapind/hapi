import { expect, test } from '@playwright/test'

for (const scale of [0.8, 0.9, 1, 1.1, 1.2, 1.3]) {
    test(`preserves the initial empty caret line at ${Math.round(scale * 100)}% font size`, async ({
        page
    }) => {
        await page.addInitScript((fontScale) => {
            localStorage.setItem('hapi-font-scale', String(fontScale))
        }, scale)
        await page.goto('/e2e-fixtures/composer-copy-fixture.html')
        const editor = page.getByRole('textbox')
        await expect(editor).not.toBeFocused()

        // Replay Safari's rounded-down autosize measurement: at 130%, it
        // writes 33px although the line and padding need about 33.8px.
        const requiredHeight = await editor.evaluate(
            (element: HTMLTextAreaElement) => {
                const style = getComputedStyle(element)
                const required =
                    parseFloat(style.lineHeight) +
                    parseFloat(style.paddingTop) +
                    parseFloat(style.paddingBottom)
                element.style.setProperty(
                    'height',
                    `${Math.floor(required)}px`,
                    'important'
                )
                return required
            }
        )

        await editor.click()
        await expect(editor).toBeFocused()
        await expect(editor).toHaveValue('')
        const height = await editor.evaluate(
            (element) => element.getBoundingClientRect().height
        )
        // Layout uses fractional CSS pixels; allow its subpixel quantization.
        expect(height).toBeGreaterThanOrEqual(requiredHeight - 1 / 32)
        expect(
            await editor.evaluate((element: HTMLTextAreaElement) => [
                element.selectionStart,
                element.selectionEnd,
                element.scrollTop
            ])
        ).toEqual([0, 0, 0])
    })
}
