import React, { useEffect, useRef } from 'react'
import { EditorState, StateField, StateEffect, RangeSetBuilder } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, drawSelection, highlightActiveLine, Decoration, gutter, GutterMarker, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentOnInput } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { oneDark } from '@codemirror/theme-one-dark'
import { useEditorStore, Tab } from '../../store'

const api = (window as any).api

interface CodeMirrorEditorProps {
  tab: Tab
  onRequestComment?: (startLine: number, endLine: number, position: { x: number; y: number }) => void
  commentVisible?: boolean
}

// --- Custom gutter for comment triggers ---

// Effects to update the selected gutter line range
const setGutterSelection = StateEffect.define<{ from: number; to: number } | null>()

// State field tracking which lines are selected via gutter drag
const gutterSelectionField = StateField.define<{ from: number; to: number } | null>({
  create() { return null },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setGutterSelection)) return e.value
    }
    return value
  },
})

// Decoration for selected gutter lines
const gutterHighlightDecoration = Decoration.line({ class: 'cm-gutter-line-selected' })

const gutterHighlightField = StateField.define({
  create() { return Decoration.none },
  update(_, tr) {
    const sel = tr.state.field(gutterSelectionField)
    if (!sel) return Decoration.none
    const builder = new RangeSetBuilder<Decoration>()
    const doc = tr.state.doc
    for (let i = sel.from; i <= sel.to && i <= doc.lines; i++) {
      const line = doc.line(i)
      builder.add(line.from, line.from, gutterHighlightDecoration)
    }
    return builder.finish()
  },
  provide: f => EditorView.decorations.from(f),
})

// The '+' marker shown on hover
class CommentGutterMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('div')
    el.className = 'cm-comment-gutter-marker'
    el.textContent = '+'
    return el
  }
}

const commentMarker = new CommentGutterMarker()

export default function CodeMirrorEditor({ tab, onRequestComment, commentVisible }: CodeMirrorEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const { updateTabContent, setTabDirty } = useEditorStore()
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isExternalUpdate = useRef(false)
  const onRequestCommentRef = useRef(onRequestComment)
  onRequestCommentRef.current = onRequestComment

  // Track gutter drag state outside CM
  const gutterDragRef = useRef<{ startLine: number; active: boolean }>({ startLine: 0, active: false })

  useEffect(() => {
    if (!editorRef.current) return

    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches

    // Compose our own basicSetup to avoid the import issue
    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      highlightSelectionMatches(),
      history(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !isExternalUpdate.current) {
          const newContent = update.state.doc.toString()
          updateTabContent(tab.id, newContent)
          setTabDirty(tab.id, true)

          // Debounced auto-save
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
          }
          debounceTimerRef.current = setTimeout(() => {
            api.writeFile(tab.filePath, newContent)
            setTabDirty(tab.id, false)
          }, 800)
        }
      }),
      // Gutter selection state
      gutterSelectionField,
      gutterHighlightField,
      // Comment gutter with '+' markers
      gutter({
        class: 'cm-comment-gutter',
        lineMarker: () => commentMarker,
        domEventHandlers: {
          mousedown(view, line, event) {
            const lineNum = view.state.doc.lineAt(line.from).number
            gutterDragRef.current = { startLine: lineNum, active: true }
            view.dispatch({ effects: setGutterSelection.of({ from: lineNum, to: lineNum }) })
            event.preventDefault()
            return true
          },
        },
      }),
    ]

    // Add dark theme if needed
    if (isDark) {
      extensions.push(oneDark)
    }

    const state = EditorState.create({
      doc: tab.content,
      extensions,
    })

    const view = new EditorView({
      state,
      parent: editorRef.current,
    })

    viewRef.current = view

    // Global mousemove/mouseup for gutter drag
    const handleMouseMove = (e: MouseEvent) => {
      if (!gutterDragRef.current.active || !viewRef.current) return
      const pos = viewRef.current.posAtCoords({ x: e.clientX, y: e.clientY })
      if (pos === null) return
      const lineNum = viewRef.current.state.doc.lineAt(pos).number
      const start = gutterDragRef.current.startLine
      const from = Math.min(start, lineNum)
      const to = Math.max(start, lineNum)
      viewRef.current.dispatch({ effects: setGutterSelection.of({ from, to }) })
    }

    const handleMouseUp = (e: MouseEvent) => {
      if (!gutterDragRef.current.active || !viewRef.current) return
      gutterDragRef.current.active = false

      const sel = viewRef.current.state.field(gutterSelectionField)
      if (!sel) return

      // Get the gutter element position to place comment box near it
      const gutterEl = editorRef.current?.querySelector('.cm-comment-gutter')
      const gutterRight = gutterEl ? gutterEl.getBoundingClientRect().right + 8 : e.clientX

      if (onRequestCommentRef.current) {
        onRequestCommentRef.current(sel.from, sel.to, { x: gutterRight, y: e.clientY })
      }
      // Don't clear gutter highlight — it stays visible while comment box is open
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      view.destroy()
      viewRef.current = null
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [tab.id]) // Only recreate on tab switch

  // Update content if it changes externally (e.g. file watcher)
  useEffect(() => {
    if (!viewRef.current) return

    const currentContent = viewRef.current.state.doc.toString()
    if (currentContent !== tab.content) {
      isExternalUpdate.current = true
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: tab.content,
        },
      })
      isExternalUpdate.current = false
    }
  }, [tab.content])

  // Clear gutter selection when comment box is dismissed
  useEffect(() => {
    if (!commentVisible && viewRef.current) {
      viewRef.current.dispatch({ effects: setGutterSelection.of(null) })
    }
  }, [commentVisible])

  return <div ref={editorRef} className="codemirror-editor" />
}
