import { useState } from 'react'
import { Layout, Splitter, Tooltip } from 'antd'
import { HomeOutlined, EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import ChatPanel from '@/components/ChatPanel/index.tsx'
import TerminalPanel from '@/components/Terminal/index.tsx'
import { FileTreePanel } from '@/components/FileTreePanel/index.tsx'
import FullSpin from '@/components/FullSpin'
import SessionList from './components/SessionList'
import RightPanel from './components/RightPanel'
import type { useProjectPage } from './useProjectPage'

const C = {
  bg0: 'var(--bg)',
  bg1: 'var(--bg-soft)',
  bg3: 'var(--line)',
  text0: 'var(--txt)',
  text1: 'var(--txt-sub)',
  text2: 'var(--txt-dim)',
  sidebar: 'var(--bg-soft)',
}

type PageState = ReturnType<typeof useProjectPage>

interface Props extends PageState {}

export default function DesktopLayout(p: Props) {
  const navigate = useNavigate()
  const [rightOpen, setRightOpen] = useState(true)

  return (
    <Layout
      className="projectPage"
      style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.bg0 }}
    >
      {p.preLoading && <FullSpin />}

      {!p.preLoading && (
        <>
          <Splitter layout="vertical" style={{ flex: 1, overflow: 'hidden' }}>
            <Splitter.Panel
              style={{ display: 'flex', flexDirection: 'row', overflow: 'hidden', minHeight: 0 }}
            >
              {/* 左工具栏：返回 + 隐藏/显示右侧面板 */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, paddingTop: 8 }}>
                <Tooltip title="返回主页" placement="right">
                  <div
                    onClick={() => navigate('/')}
                    style={{
                      width: 32, height: 32, borderRadius: 6,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', flexShrink: 0,
                      color: C.text1, fontSize: 14, transition: 'color 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = C.text0)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = C.text1)}
                  >
                    <HomeOutlined />
                  </div>
                </Tooltip>
                <Tooltip title={rightOpen ? '隐藏侧栏' : '显示侧栏'} placement="right">
                  <div
                    onClick={() => setRightOpen((v) => !v)}
                    style={{
                      width: 32, height: 32, borderRadius: 6,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', flexShrink: 0,
                      color: rightOpen ? C.text0 : C.text1, fontSize: 14, transition: 'color 0.15s',
                      background: rightOpen ? C.bg3 : 'transparent',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = C.text0)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = rightOpen ? C.text0 : C.text1)}
                  >
                    {rightOpen ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                  </div>
                </Tooltip>
              </div>

              <Splitter style={{ flex: 1, overflow: 'hidden' }}>
                {/* Session 列表 */}
                <Splitter.Panel
                  defaultSize="14%"
                  min="6%"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: C.bg0,
                    overflow: 'hidden',
                  }}
                >
                  <SessionList
                    projectCwd={p.projectCwd}
                    sessions={p.sessionsView}
                    activeId={p.activeId}
                    onSelect={p.selectSession}
                    onNew={p.startNewSession}
                    onDelete={p.deleteSession}
                    agents={p.agents}
                    selectedAgent={p.selectedAgent}
                    onSelectAgent={p.setSelectedAgent}
                  />
                </Splitter.Panel>

                {/* 聊天主区 */}
                <Splitter.Panel
                  defaultSize="44%"
                  min="20%"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: C.bg0,
                    overflow: 'hidden',
                  }}
                >
                  <ChatPanel
                    activeId={p.activeId}
                    sessionTitle={p.activeSession?.title}
                    messages={p.messages}
                    msgLoading={p.msgLoading}
                    loading={p.loading}
                    input={p.input}
                    onInputChange={p.setInput}
                    onSend={p.sendMessage}
                    onAbort={p.handleAbort}
                    onPasteImage={p.handlePasteImage}
                    activeProjectID={p.projectId ?? null}
                    pendingQuestion={p.pendingQuestion?.questions ?? null}
                    onResolve={p.handleResolve}
                    bypassPermissions={p.bypassPermissions}
                    onBypassPermissionsChange={p.setBypassPermissions}
                  />
                </Splitter.Panel>

                {/* 右侧面板组（变更/文件 + 文件树），通过 eye 按钮统一收展 */}
                <Splitter.Panel
                  defaultSize="42%"
                  size={rightOpen ? undefined : 0}
                  min="20%"
                  style={{ overflow: 'hidden' }}
                >
                  <Splitter>
                    <Splitter.Panel
                      defaultSize="65%"
                      min="20%"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        background: C.bg1,
                        overflow: 'hidden',
                      }}
                    >
                      <RightPanel
                        projectId={p.projectId ?? ''}
                        rightPanel={p.rightPanel}
                        onPanelChange={p.setRightPanel}
                        fileDiffs={p.fileDiffs}
                        selectedFile={p.selectedFile}
                        fileLoading={p.fileLoading}
                      />
                    </Splitter.Panel>
                    <Splitter.Panel
                      defaultSize="35%"
                      min="10%"
                      collapsible={{ start: true, end: false, showCollapsibleIcon: true }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        background: C.bg0,
                        overflow: 'hidden',
                      }}
                    >
                      <FileTreePanel
                        fileTree={p.fileTree}
                        treeSearch={p.treeSearch}
                        onSearchChange={p.setTreeSearch}
                        onSelectFile={p.openFile}
                      />
                    </Splitter.Panel>
                  </Splitter>
                </Splitter.Panel>
              </Splitter>
            </Splitter.Panel>

            <Splitter.Panel
              size={p.termOpen ? undefined : 0}
              defaultSize={220}
              min={80}
              max={600}
              style={{ overflow: 'hidden' }}
            >
              <TerminalPanel cwd={p.projectCwd} onClose={() => p.setTermOpen(false)} />
            </Splitter.Panel>
          </Splitter>

          {/* 底部状态栏 */}
          <div
            style={{
              height: 24,
              background: C.sidebar,
              borderTop: `1px solid ${C.bg3}`,
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              gap: 12,
              flexShrink: 0,
            }}
          >
            <span
              onClick={() => p.setTermOpen((v) => !v)}
              style={{
                color: p.termOpen ? C.text0 : C.text1,
                fontSize: 11,
                cursor: 'pointer',
                userSelect: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px',
                borderRadius: 4,
                background: p.termOpen ? C.bg3 : 'transparent',
                transition: 'all 0.12s',
              }}
            >
              ⌨ 终端
            </span>
            {p.activeSession && (
              <span style={{ color: C.text2, fontSize: 11, marginLeft: 'auto' }}>
                {p.activeSession.status === 'busy' ? '⟳ 运行中…' : '● 空闲'}
              </span>
            )}
          </div>
        </>
      )}
    </Layout>
  )
}
