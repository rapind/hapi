import type { Content, Root } from 'mdast'
import { stripNotifySummaryFooter } from '@hapi/protocol/messages'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

const parser = unified().use(remarkParse).use(remarkGfm)

export function messageSpeechText(markdown: string): string {
    function read(node: Root | Content): string {
        if (node.type === 'code' || node.type === 'inlineCode') return ' '
        if (
            node.type === 'html' ||
            node.type === 'definition' ||
            node.type === 'footnoteDefinition' ||
            node.type === 'image' ||
            node.type === 'imageReference'
        )
            return ''
        if ('value' in node) return node.value
        if (node.type === 'break') return '\n'
        if ('children' in node) {
            const separator = ['root', 'blockquote', 'list', 'listItem', 'table', 'tableRow'].includes(node.type)
                ? '\n'
                : ''
            return node.children.map((child) => read(child)).join(separator)
        }
        return ''
    }
    const prose = stripNotifySummaryFooter(markdown)
        .split('\n')
        .filter(
            (line) =>
                !/^\s*(?:[$%❯]\s+(?=[A-Za-z_./])|[\w.-]+@[\w.-]+:[^\n]*?[$#]\s|PS\s+[A-Za-z]:\\[^\n]*>\s)/.test(line)
        )
        .join('\n')
    const text = read(parser.parse(prose))
        .replace(/\b[0-9a-f]{7,64}\b/gi, (value: string, offset: number, source: string) => {
            const fullHash = value.length === 40 || value.length === 64
            const abbreviatedHash = value.length <= 40 && /[a-f]/i.test(value) && /\d/.test(value)
            const gitContext = /\b(?:commit|revision|sha(?:-?(?:1|256))?)\s*[:#]?\s*$/i.test(
                source.slice(Math.max(0, offset - 40), offset)
            )
            return fullHash || abbreviatedHash || gitContext ? '' : value
        })
        .replace(/\(\s*\)|\[\s*\]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .trim()
    return /[\p{L}\p{N}]/u.test(text) ? text : ''
}

export function supportsMessageSpeech(): boolean {
    return (
        typeof window !== 'undefined' &&
        typeof window.speechSynthesis?.speak === 'function' &&
        typeof window.speechSynthesis.cancel === 'function' &&
        typeof window.SpeechSynthesisUtterance === 'function'
    )
}

let stopCurrent: (() => void) | undefined

export function speakMessage(text: string, onFinish: (failed: boolean) => void): () => void {
    stopCurrent?.()
    const synth = window.speechSynthesis
    synth.cancel()
    let finished = false
    let utterance: SpeechSynthesisUtterance | undefined
    let remaining = text

    function finish(failed: boolean) {
        if (finished) return
        finished = true
        if (stopCurrent === stop) stopCurrent = undefined
        onFinish(failed)
    }

    function stop() {
        if (finished) return
        finish(false)
        synth.cancel()
    }

    function speakNext() {
        // Bound each utterance so long answers also work with engines that limit text length.
        let end = Math.min(remaining.length, 240)
        if (end < remaining.length) {
            const boundary = remaining.lastIndexOf(' ', end)
            if (boundary > 0) end = boundary
            else if (/[\uD800-\uDBFF]/.test(remaining[end - 1])) end -= 1
        }
        const next = new SpeechSynthesisUtterance(remaining.slice(0, end))
        utterance = next
        remaining = remaining.slice(end).trimStart()
        next.onend = () => {
            if (finished || utterance !== next) return
            if (!remaining) finish(false)
            else {
                try {
                    speakNext()
                } catch {
                    finish(true)
                }
            }
        }
        next.onerror = () => {
            if (!finished && utterance === next) finish(true)
        }
        synth.speak(next)
    }

    stopCurrent = stop
    try {
        speakNext()
    } catch (error) {
        finish(true)
        throw error
    }
    return stop
}
