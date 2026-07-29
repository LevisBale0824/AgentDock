import React, { useState } from 'react'
import { Space, Typography, Collapse, theme, Image, Modal } from 'antd'
import { CaretRightOutlined, ToolOutlined, LoadingOutlined, FileOutlined } from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { CanonicalMessage, CanonicalPart } from '@/http/index'

export interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  parts: CanonicalPart[]
  error?: string
  cost?: number
}

const { Text } = Typography

function DiffView({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  const { token } = theme.useToken()
  return (
    <div
      style={{
        fontSize: 11,
        fontFamily: 'monospace',
        marginTop: 4,
        borderRadius: 4,
        overflow: 'hidden',
        border: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      {oldStr &&
        oldStr.split('\n').map((line, i) => (
          <div
            key={`-${i}`}
            style={{
              background: '#fff2f0',
              color: '#cf1322',
              padding: '0 6px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            - {line}
          </div>
        ))}
      {newStr &&
        newStr.split('\n').map((line, i) => (
          <div
            key={`+${i}`}
            style={{
              background: '#f6ffed',
              color: '#389e0d',
              padding: '0 6px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            + {line}
          </div>
        ))}
    </div>
  )
}

function ToolCallBlock({ part }: { part: Extract<CanonicalPart, { type: 'tool_call' }> }) {
  const { token } = theme.useToken()
  const input = (part.input ?? {}) as Record<string, any>
  const name: string = part.tool

  let header: string
  let detail: React.ReactNode = null

  if (name === 'Edit' || name === 'MultiEdit') {
    header = input.file_path ?? ''
    detail = <DiffView oldStr={input.old_string ?? ''} newStr={input.new_string ?? ''} />
  } else if (name === 'Write') {
    header = input.file_path ?? ''
    detail = input.content ? (
      <div
        style={{
          fontSize: 11,
          fontFamily: 'monospace',
          color: token.colorTextSecondary,
          marginTop: 4,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: 120,
          overflow: 'hidden',
        }}
      >
        {String(input.content).slice(0, 300)}
        {String(input.content).length > 300 ? '…' : ''}
      </div>
    ) : null
  } else if (name === 'Bash') {
    header = String(input.command ?? '').slice(0, 120)
  } else if (name === 'Read') {
    header = input.file_path ?? ''
  } else if (name === 'Glob') {
    header = input.pattern ?? ''
  } else if (name === 'Grep') {
    header = `${input.pattern ?? ''}${input.path ? ` in ${input.path}` : ''}`
  } else if (name === 'Agent' || name === 'Task') {
    header = `${input?.prompt || input?.description || ''}`
  } else {
    header = (input.file_path ??
      input.command ??
      input.pattern ??
      input.path ??
      input.query ??
      input.description ??
      '') as string
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <Collapse
        bordered={false}
        size="small"
        expandIcon={({ isActive }) => (
          <CaretRightOutlined
            style={{
              color: token.colorTextTertiary,
            }}
            rotate={isActive ? 90 : 0}
          />
        )}
        style={{
          padding: 0,
        }}
        items={[
          {
            key: '1',
            label: (
              <div
                style={{
                  color: token.colorTextTertiary,
                  fontSize: 12,
                }}
              >
                <ToolOutlined style={{ fontSize: 11, flexShrink: 0, marginRight: '5px' }} />
                <span style={{ fontWeight: 500 }}>{name}</span>
              </div>
            ),
            children: (
              <div>
                {header && header}
                {detail}
              </div>
            ),
          },
        ]}
        defaultActiveKey={'1'}
      />
    </div>
  )
}

function ReasoningBlock({ text }: { text: string }) {
  const { token } = theme.useToken()
  return (
    <div style={{ padding: '4px 0' }}>
      <Collapse
        bordered={false}
        size="small"
        expandIcon={({ isActive }) => (
          <CaretRightOutlined style={{ color: token.colorTextTertiary }} rotate={isActive ? 90 : 0} />
        )}
        style={{ padding: 0 }}
        items={[
          {
            key: '1',
            label: (
              <div style={{ color: token.colorTextTertiary, fontSize: 12 }}>
                <span style={{ fontWeight: 500 }}>Thinking</span>
              </div>
            ),
            children: (
              <div style={{ fontSize: 12, color: token.colorTextSecondary, whiteSpace: 'pre-wrap' }}>
                {text}
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}

function FileCard({ name, content, token }: { name: string; content: string; token: any }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: 6,
          background: token.colorFillAlter,
          marginTop: 4,
          maxWidth: 240,
          cursor: 'pointer',
        }}
      >
        <FileOutlined style={{ fontSize: 13, color: token.colorTextSecondary, flexShrink: 0 }} />
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: token.colorText,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </span>
      </div>
      <Modal
        title={name}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={720}
        styles={{ body: { maxHeight: '70vh', overflow: 'auto' } }}
      >
        <pre
          style={{
            margin: 0,
            fontSize: 13,
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            color: token.colorText,
          }}
        >
          {content}
        </pre>
      </Modal>
    </>
  )
}

function ToolResultBlock({
  part,
}: {
  part: Extract<CanonicalPart, { type: 'tool_result' }>
}) {
  const { token } = theme.useToken()

  const text = part.content ?? ''
  const images = part.images ?? []

  if (!text && images.length === 0) return null

  return (
    <div style={{ padding: '2px 0 2px 18px' }}>
      {images.map((img, i) => (
        <Image
          key={`img-${i}`}
          src={`data:${img.mediaType};base64,${img.data}`}
          style={{ maxHeight: 240, borderRadius: 4, display: 'block', marginTop: 4 }}
        />
      ))}
      {text && (
        <span style={{ fontSize: 13, color: token.colorText, wordBreak: 'break-all' }}>
          {text.slice(0, 500)}
          {text.length > 500 ? '…' : ''}
        </span>
      )}
    </div>
  )
}

function PartListView({ msg }: { msg: CanonicalMessage }) {
  const { token } = theme.useToken()
  const parts = msg.parts

  if (msg.role === 'assistant') {
    return (
      <>
        {parts.map((p, i) => {
          if (p.type === 'text' && p.text) {
            return (
              <div key={i} className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.text}</ReactMarkdown>
              </div>
            )
          }
          if (p.type === 'tool_call') return <ToolCallBlock key={i} part={p} />
          if (p.type === 'reasoning') return <ReasoningBlock key={i} text={p.text} />
          if (p.type === 'tool_result') return <ToolResultBlock key={i} part={p} />
          if (p.type === 'image') {
            return (
              <Image
                key={i}
                src={`data:${p.mediaType};base64,${p.data}`}
                style={{ maxHeight: 240, borderRadius: 4, display: 'block', marginTop: 4 }}
              />
            )
          }
          return null
        })}
      </>
    )
  }

  // user 消息：把 parts 分成 inline / attachment 两组
  const FILE_RE = /^<file name="([^"]+)">\n([\s\S]*?)\n?<\/file>$/
  let lastInlineTextIdx = -1
  parts.forEach((p, i) => {
    if (p.type === 'text' && p.text && !FILE_RE.test(p.text)) lastInlineTextIdx = i
  })

  const inline: CanonicalPart[] = []
  const attachment: CanonicalPart[] = []
  parts.forEach((p, i) => {
    if (p.type === 'tool_result') {
      inline.push(p)
    } else if (p.type === 'text' && FILE_RE.test(p.text)) {
      attachment.push(p)
    } else if (p.type === 'image' && i > lastInlineTextIdx) {
      attachment.push(p)
    } else {
      inline.push(p)
    }
  })

  return (
    <div style={{ padding: '0 16px' }}>
      {/* 文字 + 粘贴图片区 */}
      {inline.map((p, i) => {
        if (p.type === 'tool_result') return <ToolResultBlock key={i} part={p} />
        if (p.type === 'image') {
          return (
            <Image
              key={i}
              src={`data:${p.mediaType};base64,${p.data}`}
              style={{ maxHeight: 240, borderRadius: 4, display: 'block', marginTop: 4 }}
            />
          )
        }
        if (p.type === 'text' && p.text) {
          return (
            <div key={i} className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.text}</ReactMarkdown>
            </div>
          )
        }
        return null
      })}

      {/* 附件区：图片卡片 + 文件卡片横排 */}
      {attachment.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {attachment.map((p, i) => {
            if (p.type === 'image') {
              return (
                <div
                  key={i}
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 6,
                    overflow: 'hidden',
                    flexShrink: 0,
                    border: `1px solid ${token.colorBorderSecondary}`,
                  }}
                >
                  <Image
                    src={`data:${p.mediaType};base64,${p.data}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </div>
              )
            }
            if (p.type === 'text') {
              const m = p.text.match(FILE_RE)
              if (!m) return null
              const [, name, content] = m
              return <FileCard key={i} name={name} content={content} token={token} />
            }
            return null
          })}
        </div>
      )}
    </div>
  )
}

function ThinkingIndicator() {
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#999', fontSize: 12 }}
    >
      <LoadingOutlined spin style={{ fontSize: 11 }} />
      Thinking…
    </span>
  )
}

function BubbleBody({
  msg,
  pending,
  isUser,
}: {
  msg: DisplayMessage
  pending?: boolean
  isUser: boolean
}) {
  if (msg.error) return <Text type="danger">{msg.error}</Text>

  const hasContent = msg.parts.length > 0

  return (
    <>
      <PartListView msg={msg} />
      {pending && !isUser && (
        <div style={{ marginTop: hasContent ? 6 : 0 }}>
          <ThinkingIndicator />
        </div>
      )}
    </>
  )
}

export function MessageBubble({ msg, pending }: { msg: DisplayMessage; pending?: boolean }) {
  const { token } = theme.useToken()
  const isUser = msg.role === 'user'

  const bubbleStyle = {
    position: 'relative' as const,
    width: '100%',
    background: isUser ? token.colorFillAlter : '',
    borderRadius: 10,
    color: '#1a1a1a',
    padding: isUser ? '8px 2px' : '4px 13px',
    margin: isUser ? '28px 0 2px 0' : '0',
    lineHeight: 1.6,
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        marginBottom: 0,
      }}
    >
      <Space size={5} style={{ marginBottom: 5 }}>
        {msg.cost != null && msg.cost > 0 && (
          <Text style={{ fontSize: 10, color: '#bbb' }}>${msg.cost.toFixed(5)}</Text>
        )}
      </Space>
      <div style={bubbleStyle}>
        <BubbleBody msg={msg} pending={pending} isUser={isUser} />
      </div>
    </div>
  )
}
