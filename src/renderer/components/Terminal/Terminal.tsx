import React, { useEffect, useRef, useCallback } from 'react'
import { Terminal as XTerminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useEditorStore } from '../../store'
import { PlusIcon, CommandLineIcon, XMarkIcon } from '@heroicons/react/16/solid'
import '../../styles/Terminal.css'
import '@xterm/xterm/css/xterm.css'

const api = (window as any).api

// Claude logo SVG as inline component
const ClaudeIcon = () => (
  <svg height="14" width="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#D97757" fillRule="nonzero"/>
  </svg>
)

interface TerminalInstance {
  id: string
  terminal: XTerminal
  fitAddon: FitAddon
  cleanups: (() => void)[]
}

export default function Terminal() {
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const terminalsRef = useRef<Map<string, TerminalInstance>>(new Map())
  const { terminalIds, terminalTypes, activeTerminalId, setActiveTerminal, addTerminal, removeTerminal, rootDir } =
    useEditorStore()

  const initTerminal = useCallback((terminalId: string, element: HTMLDivElement) => {
    if (terminalsRef.current.has(terminalId) || !element) return

    console.log(`[Terminal:renderer] initTerminal: id=${terminalId.slice(0, 8)}`)

    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches

    const terminal = new XTerminal({
      theme: isDark
        ? { background: '#1a1a2e', foreground: '#e0e0e0', cursor: '#528bff' }
        : { background: '#ffffff', foreground: '#1e1e1e', cursor: '#526eff' },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)

    terminal.open(element)

    // Small delay to ensure DOM is ready before fitting
    requestAnimationFrame(() => {
      try { fitAddon.fit() } catch {}
    })

    // Terminal input → main process
    const dataDisposable = terminal.onData((data) => {
      api.writeTerminal(terminalId, data)
    })

    // Main process → terminal output (live data, after replay)
    let liveCount = 0
    const cleanupData = api.onTerminalData((id: string, data: string) => {
      if (id === terminalId) {
        liveCount++
        if (liveCount <= 3) {
          console.log(`[Terminal:renderer] live data #${liveCount}: id=${terminalId.slice(0, 8)}, bytes=${data.length}`)
        }
        terminal.write(data)
      }
    })

    const cleanupExit = api.onTerminalExit((id: string) => {
      if (id === terminalId) {
        terminal.write('\r\n\x1b[33m[Process exited]\x1b[0m\r\n')
      }
    })

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        api.resizeTerminal(terminalId, terminal.cols, terminal.rows)
      } catch {}
    })
    resizeObserver.observe(element)

    terminalsRef.current.set(terminalId, {
      id: terminalId,
      terminal,
      fitAddon,
      cleanups: [
        () => dataDisposable.dispose(),
        cleanupData,
        cleanupExit,
        () => resizeObserver.disconnect(),
      ],
    })

    // Request replay buffer from main process.
    // Returns ALL pty output since terminal creation + enables live sending.
    //
    // IMPORTANT: We use `terminal` from the closure — NOT terminalsRef lookup.
    // React 18 StrictMode can clear terminalsRef between when we store the
    // instance above and when this .then() resolves (the cleanup effect runs
    // in the unmount phase of double-mount). Using the closure variable
    // guarantees we write to the xterm we just created.
    api.markTerminalReady(terminalId)
      .then((replayData: string[]) => {
        console.log(`[Terminal:renderer] replay received: id=${terminalId.slice(0, 8)}, chunks=${replayData?.length || 0}`)
        if (replayData && replayData.length > 0) {
          try {
            for (const data of replayData) {
              terminal.write(data)
            }
          } catch {
            // terminal may have been disposed by StrictMode — that's OK,
            // the remount will request replay again and get the full buffer
          }
        }
      })
      .catch((err: any) => {
        console.error(`[Terminal:renderer] markTerminalReady failed: id=${terminalId.slice(0, 8)}`, err)
      })
  }, [])

  // Cleanup frontend xterm instances on unmount (but NOT the backend pty —
  // that's managed by TerminalManager and cleaned up on app quit).
  // This is critical for React 18 StrictMode which double-mounts in dev.
  useEffect(() => {
    return () => {
      terminalsRef.current.forEach((instance) => {
        instance.cleanups.forEach((fn) => fn())
        instance.terminal.dispose()
        // Do NOT call api.disposeTerminal here — StrictMode unmount/remount
        // would kill the backend pty, causing SIGHUP on the first terminal.
      })
      terminalsRef.current.clear()
    }
  }, [])

  const handleAddTerminal = async (launchClaude: boolean = false) => {
    const cwd = rootDir || '/'
    const id = await api.createTerminal(cwd, launchClaude)
    addTerminal(id, launchClaude ? 'claude' : 'shell')
    setActiveTerminal(id)
  }

  const handleRemoveTerminal = (terminalId: string) => {
    const instance = terminalsRef.current.get(terminalId)
    if (instance) {
      instance.cleanups.forEach((fn) => fn())
      instance.terminal.dispose()
      api.disposeTerminal(terminalId)
      terminalsRef.current.delete(terminalId)
    }
    removeTerminal(terminalId)
  }

  const setContainerRef = useCallback((terminalId: string) => (el: HTMLDivElement | null) => {
    if (el) {
      containerRefs.current.set(terminalId, el)
      // Initialize if not yet done
      if (!terminalsRef.current.has(terminalId)) {
        initTerminal(terminalId, el)
      }
    }
  }, [initTerminal])

  // Focus active terminal
  useEffect(() => {
    if (activeTerminalId) {
      const instance = terminalsRef.current.get(activeTerminalId)
      if (instance) {
        instance.terminal.focus()
        requestAnimationFrame(() => {
          try { instance.fitAddon.fit() } catch {}
        })
      }
    }
  }, [activeTerminalId])

  return (
    <div className="terminal-container">
      <div className="terminal-tab-bar">
        {terminalIds.map((id) => {
          const type = terminalTypes[id] || 'shell'
          // Count how many of this type exist before this one (for numbering)
          const sameTypeBefore = terminalIds.filter((tid, i) => i < terminalIds.indexOf(id) && (terminalTypes[tid] || 'shell') === type).length
          const typeCount = sameTypeBefore + 1
          const label = type === 'claude'
            ? (typeCount === 1 ? 'Claude' : `Claude ${typeCount}`)
            : (typeCount === 1 ? 'Terminal' : `Terminal ${typeCount}`)
          return (
          <div
            key={id}
            className={`terminal-tab ${id === activeTerminalId ? 'active' : ''}`}
            onClick={() => setActiveTerminal(id)}
          >
            {type === 'claude' ? <ClaudeIcon /> : <CommandLineIcon className="terminal-tab-icon" />}
            <span className="terminal-tab-name">{label}</span>
            {terminalIds.length > 1 && (
              <button
                className="terminal-tab-close"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemoveTerminal(id)
                }}
              >
                <XMarkIcon width={12} height={12} />
              </button>
            )}
          </div>
        )})}
        <button className="terminal-tab-add" onClick={() => handleAddTerminal(false)} title="New terminal">
          <CommandLineIcon width={14} height={14} />
          <PlusIcon width={10} height={10} className="terminal-add-plus" />
        </button>
        <button className="terminal-tab-add claude" onClick={() => handleAddTerminal(true)} title="New terminal with Claude">
          <ClaudeIcon />
          <PlusIcon width={10} height={10} className="terminal-add-plus" />
        </button>
      </div>
      <div className="terminal-instances">
        {terminalIds.map((id) => (
          <div
            key={id}
            ref={setContainerRef(id)}
            className={`terminal-instance ${id === activeTerminalId ? 'active' : ''}`}
          />
        ))}
      </div>
    </div>
  )
}
