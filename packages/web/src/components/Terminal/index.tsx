import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

const WS_BASE = `ws://${import.meta.env.MODE === 'development' ? 'localhost:8003' : window.location.host}/api`

interface Props {
  cwd?: string
  onClose?: () => void
  welcomeMessage?: string
}

export default function TerminalPanel({ cwd, onClose, welcomeMessage }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", "Cascadia Code", "Fira Code", Menlo, monospace',
      theme: {
        background: '#08090D',
        foreground: '#E8EBF1',
        cursor: '#00FFA3',
        cursorAccent: '#08090D',
        selectionBackground: 'rgba(0,255,163,.2)',
        black: '#08090D',
        red: '#FF5C5C',
        green: '#00FFA3',
        yellow: '#FF8A3D',
        blue: '#5B9DFF',
        magenta: '#C77DFF',
        cyan: '#5BE7E7',
        white: '#E8EBF1',
        brightBlack: '#6B7280',
        brightRed: '#FF8A8A',
        brightGreen: '#5BFFC4',
        brightYellow: '#FFB066',
        brightBlue: '#8FB8FF',
        brightMagenta: '#DAA6FF',
        brightCyan: '#8FF0F0',
        brightWhite: '#FFFFFF',
      },
      convertEol: true,
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    fitAddon.fit()
    termRef.current = term
    fitRef.current = fitAddon

    const url = `${WS_BASE}/terminal${cwd ? `?cwd=${encodeURIComponent(cwd)}` : ''}`
    const ws = new WebSocket(url)
    wsRef.current = ws
    let intentionalClose = false

    if (welcomeMessage) term.write(welcomeMessage)

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      term.focus()
    }
    ws.onmessage = (e) => term.write(e.data)
    ws.onclose = () => {
      if (!intentionalClose) term.write('\r\n\x1b[31m[disconnected]\x1b[0m\r\n')
    }

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data)
    })

    const ro = new ResizeObserver(() => {
      fitAddon.fit()
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
    })
    ro.observe(containerRef.current)

    return () => {
      intentionalClose = true
      ro.disconnect()
      ws.close()
      term.dispose()
    }
  }, [cwd])

  return (
    <div
      style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          height: 28,
          background: 'var(--bg-soft)',
          borderBottom: '1px solid var(--line)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: 'var(--txt-sub)',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
            fontWeight: 600,
          }}
        >
          终端 {cwd ? `— ${cwd.split('/').pop()}` : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onClose && (
            <span
              onClick={onClose}
              style={{
                color: 'var(--txt-dim)',
                fontSize: 13,
                cursor: 'pointer',
                lineHeight: 1,
                padding: '0 2px',
              }}
            >
              ✕
            </span>
          )}
        </div>
      </div>
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', padding: '2px 0' }} />
    </div>
  )
}
