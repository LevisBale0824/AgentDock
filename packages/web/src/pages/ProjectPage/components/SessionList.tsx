import { List, Button, Typography, Space, Tag, Popconfirm, Select } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import type { SessionSummary, ProviderInfo, AgentType } from '@/http/index'
import { NEW_SESSION_ID } from '../useProjectPage'

const { Text } = Typography

/** 格式化时间戳：今天→HH:mm，昨天→昨天 HH:mm，更早→MM-DD HH:mm */
function fmtTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === now.toDateString()) return timeStr
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${timeStr}`
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${timeStr}`
}

const C = {
  bg0: 'var(--bg)',
  bg1: 'var(--bg-soft)',
  bg3: 'var(--line)',
  text0: 'var(--txt)',
  text1: 'var(--txt-sub)',
}

const AGENT_COLOR: Record<string, string> = {
  opencode: 'orange',
  zero: 'purple',
  kilo: 'green',
  claude: 'green',
}

interface Props {
  projectCwd: string
  sessions: SessionSummary[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  agents: ProviderInfo[]
  selectedAgent: AgentType
  onSelectAgent: (a: AgentType) => void
}

export default function SessionList({
  projectCwd,
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  agents,
  selectedAgent,
  onSelectAgent,
}: Props) {
  const showAgentSwitch = agents.length > 1

  return (
    <>
      <div style={{ padding: '10px 10px 8px', borderBottom: `1px solid ${C.bg3}`, flexShrink: 0 }}>
        <div style={{ marginBottom: 8, paddingLeft: 2 }}>
          <div
            className="font-display"
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: C.text0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              letterSpacing: '-.01em',
            }}
          >
            {projectCwd.split('/').pop()}
          </div>
          <div
            className="font-mono"
            style={{
              fontSize: 11,
              color: C.text1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginTop: 2,
            }}
          >
            ~/{projectCwd.split('/').slice(-2, -1)[0]}
          </div>
        </div>
        <Button
          icon={<PlusOutlined />}
          block
          type="dashed"
          onClick={onNew}
          style={{ borderRadius: 6, fontWeight: 500 }}
        >
          新建会话
        </Button>
        {showAgentSwitch && (
          <Select
            size="small"
            value={selectedAgent}
            onChange={(v) => onSelectAgent(v)}
            options={agents.map((a) => ({ value: a.type, label: a.label }))}
            style={{ width: '100%', marginTop: 6 }}
          />
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        <List
          dataSource={sessions}
          renderItem={(s) => (
            <List.Item
              onClick={() => s.id !== NEW_SESSION_ID && onSelect(s.id)}
              style={{
                cursor: 'pointer',
                padding: '6px 10px',
                background: s.id === activeId ? 'var(--acc-soft)' : 'transparent',
                borderRadius: 6,
                margin: '1px 6px',
                boxShadow: s.id === activeId ? '0 0 0 1px var(--acc-line)' : 'none',
                transition: 'all 0.1s',
                border: 'none',
              }}
              actions={[
                <Popconfirm key="del" title="删除此会话？" onConfirm={() => onDelete(s.id)}>
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    danger
                    onClick={(e) => e.stopPropagation()}
                  />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space size={4}>
                    <Text
                      ellipsis
                      style={{
                        maxWidth: 110,
                        fontSize: 12.5,
                        color: s.id === activeId ? C.text0 : C.text1,
                      }}
                    >
                      {s.title}
                    </Text>
                    {showAgentSwitch && s.agent && (
                      <Tag
                        color={AGENT_COLOR[s.agent] ?? 'default'}
                        style={{ fontSize: 10, padding: '0 3px', lineHeight: '15px' }}
                      >
                        {s.agent}
                      </Tag>
                    )}
                    {s.status === 'busy' && (
                      <Tag
                        color="orange"
                        style={{ fontSize: 10, padding: '0 3px', lineHeight: '15px' }}
                      >
                        运行中
                      </Tag>
                    )}
                  </Space>
                }
                description={
                  <Text className="font-mono" style={{ fontSize: 11, color: C.text1 }}>
                    {fmtTime(s.lastModified)}
                  </Text>
                }
              />
            </List.Item>
          )}
        />
      </div>
    </>
  )
}
