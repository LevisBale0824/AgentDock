import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { App as AntdApp } from 'antd'
import type { TreeDataNode } from 'antd'
import {
  api,
  type SessionSummary,
  type CanonicalMessage,
  type CanonicalPart,
  type ContentBlock,
  type AskUserQuestion,
  type ProviderInfo,
  type AgentType,
  type AvailableModel,
} from '@/http/index'
import type { Attachment } from '@/components/ChatInput/index.tsx'
import { type DisplayMessage } from '@/components/MessageBubble/index.tsx'
import { FileTreePanel, toTreeData } from '@/components/FileTreePanel/index.tsx'
import { type FileDiff } from '@/components/DiffReview/index.tsx'
import { mergeDiffs, extractDiffsFromMessages } from '@/components/DiffReview/utils'
import { isMediaFile } from '@/utils/file'


export interface ImageData {
  data: string
  media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
}

export const NEW_SESSION_ID = 'new'

export function useProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()

  const [projectCwd, setProjectCwd] = useState('')
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [preLoading, setPreLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [msgLoading, setMsgLoading] = useState(false)
  const [imageMap, setImageMap] = useState<Map<string, ImageData>>(new Map())
  const [termOpen, setTermOpen] = useState(true)
  const [fileTree, setFileTree] = useState<TreeDataNode[]>([])
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string } | null>(null)
  const [rightPanel, setRightPanel] = useState<'review' | 'file'>('review')
  const [fileDiffs, setFileDiffs] = useState<FileDiff[]>([])
  const [fileLoading, setFileLoading] = useState(false)
  const [treeSearch, setTreeSearch] = useState('')
  const [bypassPermissions, setBypassPermissions] = useState(true)
  const [agents, setAgents] = useState<ProviderInfo[]>([])
  const [selectedAgent, setSelectedAgent] = useState<AgentType>(
    () => (localStorage.getItem('agentdock:selectedAgent') as AgentType) || 'claude'
  )
  const [opencodeModels, setOpencodeModels] = useState<AvailableModel[]>([])
  const [selectedOpencodeModel, setSelectedOpencodeModel] = useState<{
    providerID: string
    modelID: string
  } | null>(null)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [mobileTab, setMobileTab] = useState<'chat' | 'review'>('chat')
  const [pendingQuestion, setPendingQuestion] = useState<{
    sessionId: string
    questions: AskUserQuestion[]
  } | null>(null)

  const pendingNewCwd = useRef<string | null>(null)

  const activeSession = sessions.find((s) => s.id === activeId)

  const filterIdeParts = (parts: CanonicalPart[]): CanonicalPart[] =>
    parts.filter((p) => !(p.type === 'text' && p.text?.trimStart()?.startsWith?.('<ide_')))

  const hasUserContent = (parts: CanonicalPart[]): boolean =>
    parts.some(
      (p) => p.type === 'image' || (p.type === 'text' && !p.text?.trimStart()?.startsWith?.('<ide_'))
    )

  const hasAssistantContent = (parts: CanonicalPart[]): boolean =>
    parts.some((p) => !(p.type === 'reasoning' && p.text === '[redacted thinking]'))

  const blocksToParts = (blocks: ContentBlock[]): CanonicalPart[] =>
    blocks.map((b) =>
      b.type === 'image'
        ? { type: 'image', mediaType: b.media_type, data: b.data }
        : { type: 'text', text: b.text }
    )

  async function loadMessages(id: string) {
    setMsgLoading(true)
    try {
      const msgs = await api.getMessages(id)
      const displayed: DisplayMessage[] = []
      for (const m of msgs) {
        if (m.role === 'user') {
          const parts = filterIdeParts(m.parts)
          if (hasUserContent(parts)) displayed.push({ id: m.id, role: 'user', parts })
        } else if (m.role === 'assistant') {
          if (hasAssistantContent(m.parts)) {
            displayed.push({ id: m.id, role: 'assistant', parts: m.parts })
          }
        }
      }
      setMessages(displayed)
      setFileDiffs(extractDiffsFromMessages(msgs))
    } finally {
      setMsgLoading(false)
    }
  }

  async function selectSession(id: string) {
    setActiveId(id)
    setFileDiffs([])
    await loadMessages(id)
  }

  function startNewSession() {
    setActiveId(NEW_SESSION_ID)
    setMessages([])
    setSessions((prev) => {
      if (prev.some((s) => s.id === NEW_SESSION_ID)) return prev
      return [
        {
          id: NEW_SESSION_ID,
          title: '新建会话',
          cwd: projectCwd,
          status: 'idle',
          lastModified: Date.now(),
        },
        ...prev,
      ]
    })
  }

  async function deleteSession(id: string) {
    if (id === NEW_SESSION_ID) {
      setSessions((prev) => prev.filter((s) => s.id !== NEW_SESSION_ID))
      if (activeId === NEW_SESSION_ID) {
        setActiveId(null)
        setMessages([])
      }
      return
    }
    await api.deleteSession(id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (activeId === id) {
      setActiveId(null)
      setMessages([])
    }
  }

  function handlePasteImage(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      const media_type = file.type as ImageData['media_type']
      const key = `[Image ${imageMap.size + 1}]`
      setImageMap((prev) => new Map(prev).set(key, { data: base64, media_type }))
      setInput((prev) => prev + key)
    }
    reader.readAsDataURL(file)
  }

  // 把输入框文字（含 [Image N] token 和 @file 引用）+ 附件 组合成 content 块数组
  // 顺序：文字中内嵌图片按位置排列，附件追加在末尾
  function buildContent(raw: string, attachments: Attachment[]): ContentBlock[] {
    const blocks: ContentBlock[] = []

    // 同时匹配 [Image N]（粘贴图片 token）和 @[display](path)（@文件引用）
    const TOKEN_RE = /(\[Image \d+\]|@\[[^\]]*\]\([^)]+\))/g
    let last = 0
    let match: RegExpExecArray | null
    while ((match = TOKEN_RE.exec(raw)) !== null) {
      if (match.index > last) blocks.push({ type: 'text', text: raw.slice(last, match.index) })
      const token = match[0]
      if (token.startsWith('[Image')) {
        const img = imageMap.get(token)
        if (img) blocks.push({ type: 'image', media_type: img.media_type, data: img.data })
        else blocks.push({ type: 'text', text: token })
      } else {
        const filePath = token.match(/\(([^)]+)\)$/)?.[1]
        blocks.push({ type: 'text', text: filePath ?? token })
      }
      last = match.index + token.length
    }
    if (last < raw.length) blocks.push({ type: 'text', text: raw.slice(last) })

    // 附件追加在末尾：图片用扁平格式，文本文件包 XML 标签
    for (const att of attachments) {
      if (att.mediaType) {
        blocks.push({ type: 'image', media_type: att.mediaType, data: att.content } as any)
      } else {
        blocks.push({ type: 'text', text: `<file name="${att.name}">\n${att.content}\n</file>` })
      }
    }

    // 合并相邻 text 块，但文件附件块不参与合并（保证 <file name="..."> 始终在块起始位置，正则才能匹配）
    const isFileBlock = (b: ContentBlock) =>
      b.type === 'text' && (b as any).text?.startsWith('<file name="')
    return blocks.reduce<ContentBlock[]>((acc, block) => {
      const prev = acc[acc.length - 1]
      if (block.type === 'text' && prev?.type === 'text' && !isFileBlock(block) && !isFileBlock(prev)) {
        prev.text += (block as any).text
      } else {
        acc.push(block)
      }
      return acc
    }, [])
  }

  async function handleResolve(
    answers: Record<string, string>,
    annotations?: Record<string, { preview?: string; notes?: string }>
  ) {
    if (!pendingQuestion) return
    setPendingQuestion(null)
    await api.resolveApproval(pendingQuestion.sessionId, answers, annotations)
  }

  async function handleAbort() {
    if (!activeId || activeId === NEW_SESSION_ID) return
    try {
      await api.abortSession(activeId)
    } catch {
      /* ignore */
    }
  }

  async function openFile(filePath: string) {
    if (!projectId) return
    if (isMediaFile(filePath)) {
      setSelectedFile({ path: filePath, content: '' })
      setRightPanel('file')
      return
    }
    setFileLoading(true)
    try {
      const f = await api.getFile(projectId, filePath)
      setSelectedFile(f)
      setRightPanel('file')
    } finally {
      setFileLoading(false)
    }
  }
  async function sendMessage(attachments: Attachment[]) {
    if (!input.trim() && attachments.length === 0) return
    if (!activeId || loading) return
    const raw = input.trim()
    const sessionId = activeId
    const isNew = sessionId === NEW_SESSION_ID

    setInput('')
    setImageMap(new Map())
    setLoading(true)

    const content = buildContent(raw, attachments)

    const userParts = blocksToParts(content)

    setMessages((prev) => [
      ...prev,
      {
        id: 'tmp_user',
        role: 'user' as DisplayMessage['role'],
        parts: userParts,
      },
    ])
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, status: 'busy' as const } : s))
    )

    const sendId = isNew ? NEW_SESSION_ID : sessionId
    // 始终传 cwd，服务重启后内存 runtime 丢失时服务端可从 cwd 重建
    const cwd = projectCwd

    try {
      await api.sendMessageStream(
        sendId,
        content,
        bypassPermissions,
        cwd,
        isNew ? selectedAgent : undefined,
        selectedAgent === 'opencode' && selectedOpencodeModel
          ? { opencodeModel: selectedOpencodeModel }
          : undefined,
        {
        onAskUser: (questions) => {
          setPendingQuestion({ sessionId: pendingNewCwd.current ? '' : sessionId, questions })
        },
        onMessage: (msg) => {
          if (msg.role === 'assistant') {
            const incoming = extractDiffsFromMessages([msg])
            if (incoming.length > 0) setFileDiffs((prev) => mergeDiffs(prev, incoming))
          }
          setMessages((prev) => {
            if (msg.role === 'user') {
              const parts = filterIdeParts(msg.parts)
              if (!hasUserContent(parts)) return prev
              return prev.map((m) => (m.id === 'tmp_user' ? { ...m, id: msg.id, parts } : m))
            } else if (msg.role === 'assistant') {
              if (!hasAssistantContent(msg.parts)) return prev
              return [
                ...prev,
                {
                  id: msg.id,
                  role: 'assistant' as DisplayMessage['role'],
                  parts: msg.parts,
                },
              ]
            }
            return prev
          })
        },
        onDone: (doneData) => {
          setPendingQuestion(null)
          const realId = doneData.sessionId
          setActiveId(realId)
          setSessions((prev) => {
            // realId 为空（新建会话未拿到真实 id）→ 无法升级占位会话，保留原样
            if (!realId) return prev
            // 找不到 realId 会话 → 把 'new' 占位会话升级为真实会话
            if (!prev.some((s) => s.id === realId)) {
              return prev.map((s) =>
                s.id === NEW_SESSION_ID
                  ? { ...s, id: realId, status: 'idle' as const, agent: selectedAgent }
                  : s
              )
            }
            return prev.map((s) => (s.id === realId ? { ...s, status: 'idle' as const } : s))
          })
          if (projectId) {
            api
              .getFileTree(projectId)
              .then((nodes) => setFileTree(toTreeData(nodes)))
              .catch(() => {})
          }
        },
        onError: (errMsg) => {
          if (/aborted/.test(errMsg)) message.warning('已取消')
          else message.error(errMsg)
        },
      })
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : 'Unknown error'
      message.error(errStr)
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: 'idle' as const } : s))
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    api.listAgents().then(setAgents).catch(() => {})
  }, [])

  // opencode 时拉取可用 model 列表（用于会话内选模型）
  useEffect(() => {
    if (selectedAgent !== 'opencode') {
      setOpencodeModels([])
      return
    }
    api
      .getModels('opencode')
      .then(({ models }) => setOpencodeModels(models))
      .catch(() => setOpencodeModels([]))
  }, [selectedAgent])

  useEffect(() => {
    if (!projectId) return
    setPreLoading(true)
    ;(async () => {
      try {
        const projects = await api.listProjects()
        const p = projects.find((x) => x.id === projectId)
        if (!p) {
          navigate('/')
          return
        }
        setProjectCwd(p.cwd)
      } catch {
        /* ignore */
      }
      try {
        const ss = await api.listProjectSessions(projectId)
        setSessions(ss)
        if (ss.length > 0) selectSession(ss[0].id)
      } catch {
        /* ignore */
      }
      try {
        const nodes = await api.getFileTree(projectId)
        setFileTree(toTreeData(nodes))
      } catch {
        /* ignore */
      }
      setPreLoading(false)
    })()
  }, [projectId])

  useEffect(() => {
    console.log('messages', messages)
  }, [messages])

  // 按当前选中的 agent 过滤会话列表：切换 agent 时只显示对应的会话
  // 历史会话属于哪个 agent 是既定事实，都该可见；按 selectedAgent 过滤会导致
  // 切错 agent 时看不到另一边的会话。归属用 SessionList 里的 agent 标签区分。
  const sessionsView = sessions

  return {
    projectId,
    projectCwd,
    sessions,
    sessionsView,
    activeId,
    activeSession,
    messages,
    input,
    setInput,
    preLoading,
    loading,
    msgLoading,
    termOpen,
    setTermOpen,
    fileTree,
    selectedFile,
    rightPanel,
    setRightPanel,
    fileDiffs,
    fileLoading,
    treeSearch,
    setTreeSearch,
    bypassPermissions,
    setBypassPermissions,
    agents,
    selectedAgent,
    setSelectedAgent,
    opencodeModels,
    selectedOpencodeModel,
    setSelectedOpencodeModel,
    mobileDrawerOpen,
    setMobileDrawerOpen,
    mobileTab,
    setMobileTab,
    pendingQuestion,
    selectSession,
    startNewSession,
    deleteSession,
    sendMessage,
    handleAbort,
    handleResolve,
    handlePasteImage,
    openFile,
  }
}
