# AgentDock 前端重新设计(Deep Glass × Serif)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 AgentDock web UI 整体重塑为深空玻璃态配色 + Fraunces 衬线标题的视觉语言,离线可用,不破坏现有功能。

**Architecture:** 三层主题入口——`styles/global.less` 定义 CSS 变量 token 与 `.glass`/`.tilt`/动效工具类;`App.tsx` 的 AntD `ConfigProvider` 切深色 + 绿 token;`main.tsx` 自托管引入字体。各组件删除本地 `C` 颜色常量、inline 浅色 hex 按"颜色映射表"替换为 CSS 变量、区块标题套 `.font-display`。

**Tech Stack:** React 19 + Ant Design 5 + Vite + less;字体经 `@fontsource-variable/*` 本地自托管;xterm.js / shiki 各自配深色主题。

**关于验证(适配说明):** 本计划为纯视觉改造,无可单测的业务逻辑。每个任务的验证 = `pnpm --filter @claude-web/ui build` 通过(零 TS 错误)+ `pnpm dev` 目检对应页面。不写单元测试。

---

## 颜色映射表(所有组件任务复用)

执行任何组件任务时,把 inline 浅色按下表替换为 CSS 变量(变量在 Task 1 定义):

| 原值(浅色) | 替换为 |
|---|---|
| `'#f7f7f8'` / `C.bg0` | `var(--bg)` |
| `'#ffffff'` / `'#fff'` / `C.bg1` | `var(--bg-soft)`(或容器加 `className="glass"`) |
| `'#e8e8ec'` / `C.bg3` | `var(--line)` |
| `'#efefef'` / `C.sidebar` | `var(--bg-soft)` |
| `'#1a1a1a'` / `C.text0` | `var(--txt)` |
| `'#888'` / `'#888888'` / `C.text1` | `var(--txt-sub)` |
| `'#bbb'` / `C.text2` | `var(--txt-dim)` |
| `'#1677ff'`(蓝强调) | `var(--acc)` |
| `'#e6f4ff'` / `'#f0f5ff'` / `'#f0f9ff'` / `'#bae0ff'`(蓝底) | `var(--acc-soft)` |
| `'#0958d9'`(深蓝文字) | `var(--acc)` |
| `'transparent'` | 保持 `transparent` |

通用手法:
- 删除组件内的 `const C = { ... }` 对象,所有引用改为上表变量。
- 区块标题(会话/对话/文件/项目名/页面标题)的元素加 `className="font-display"`(Fraunces 衬线)。
- 代码/路径/时间/工具标签加 `className="font-mono"`。
- 蓝色 hover/选中态 → 绿系:`var(--acc-soft)` 底 + `var(--acc-line)` 边。
- 白底卡片容器优先加 `className="glass"`(毛玻璃);列表/菜单等 AntD 容器保持实色 `var(--bg-soft)`(避免透明叠加发灰)。

---

## File Structure

- **`packages/web/src/styles/global.less`** — 改:主题 token 变量、body 深色基底、滚动条、`.glass`/`.tilt`/`.font-display`/`.font-mono` 工具类、`fadeInUp` 动画。
- **`packages/web/src/main.tsx`** — 改:import 三个 `@fontsource-variable/*`。
- **`packages/web/src/App.tsx`** — 改:`ConfigProvider` token 切深色 + 绿 + Manrope。
- **`packages/web/src/styles/markdown.less`** — 改:代码块/引用/链接深色化。
- **`packages/web/src/pages/ProjectPage/DesktopLayout.tsx`** / **`MobileLayout.tsx`** / **`index.tsx`** — 改:删 `C`、框架/工具条/状态栏颜色。
- **`packages/web/src/pages/ProjectPage/components/SessionList.tsx`** — 改:选中态亮绿、标题衬线。
- **`packages/web/src/components/ChatPanel/index.tsx`** — 改:顶栏衬线标题、Thinking 玻璃浮层、AskUserCard 深色。
- **`packages/web/src/components/ChatInput/index.tsx`** — 改:玻璃输入框、`@`/`/` 补全浮层、附件卡深色。
- **`packages/web/src/components/MessageBubble/index.tsx`** — 改:玻璃气泡、工具 chip 绿色。
- **`packages/web/src/pages/HomePage/index.tsx`** + **`index.less`** — 改:Hero 衬线标题、项目卡 `.tilt` 3D、DirPicker 深色。
- **`packages/web/src/pages/ProjectPage/components/RightPanel.tsx`** — 改:tab/diff 着色。
- **`packages/web/src/components/FileTreePanel/index.tsx`** + **`FileViewer/index.tsx`** — 改:深色(含 shiki 主题)。
- **`packages/web/src/components/Terminal/index.tsx`** — 改:xterm `theme` 深色绿。
- **`packages/web/src/components/DiffReview/index.tsx`** + **`FullSpin/index.tsx`** — 改:深色。

---

## Task 1: 主题基础设施(token + 字体 + AntD token)

**Files:**
- Modify: `packages/web/src/styles/global.less`
- Modify: `packages/web/src/main.tsx`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/package.json`(经 pnpm add)

- [ ] **Step 1: 安装自托管字体包**

Run:
```bash
pnpm --filter @claude-web/ui add @fontsource-variable/fraunces @fontsource-variable/manrope @fontsource-variable/jetbrains-mono
```
Expected: 三个包写入 `packages/web/package.json` dependencies,安装成功。

- [ ] **Step 2: 在 main.tsx 引入字体**

Modify `packages/web/src/main.tsx`,在现有 `import '@/styles/global.less'` 之前加三行:

```ts
import '@fontsource-variable/fraunces'
import '@fontsource-variable/manrope'
import '@fontsource-variable/jetbrains-mono'
```

- [ ] **Step 3: 写 global.less 主题层**

把 `packages/web/src/styles/global.less` 全文替换为:

```less
* {
  margin: 0;
  padding: 0;
  border: none;
}

:root {
  --bg:        #08090D;
  --bg-soft:   #0C0E14;
  --bg-elev:   #11141B;
  --glass:     rgba(255,255,255,.04);
  --glass-2:   rgba(255,255,255,.06);
  --line:      rgba(255,255,255,.09);
  --line-soft: rgba(255,255,255,.06);
  --txt:       #E8EBF1;
  --txt-sub:   #9AA0AC;
  --txt-dim:   #6B7280;
  --acc:       #00FFA3;
  --acc-soft:  rgba(0,255,163,.12);
  --acc-line:  rgba(0,255,163,.30);
  --acc-ink:   #06120C;
  --warn:      #FF8A3D;
  --danger:    #FF5C5C;
  --radius:    10px;
  --radius-sm: 6px;
  --shadow:    0 20px 50px rgba(0,0,0,.45);
  --blur:      10px;

  --font-display: 'Fraunces Variable', ui-serif, Georgia, serif;
  --font-ui:      'Manrope Variable', ui-sans-serif, system-ui, sans-serif;
  --font-mono:    'JetBrains Mono Variable', ui-monospace, monospace;
}

html, body, #root {
  height: 100%;
}

body {
  background:
    radial-gradient(1000px 560px at 8% -10%, rgba(0,255,163,.06), transparent 60%),
    radial-gradient(900px 500px at 100% 0%, rgba(0,255,163,.03), transparent 55%),
    var(--bg);
  color: var(--txt);
  font-family: var(--font-ui);
  -webkit-font-smoothing: antialiased;
}

/* 滚动条深色 */
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 6px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.18); }
::-webkit-scrollbar-track { background: transparent; }

/* 工具类 */
.glass {
  background: var(--glass);
  backdrop-filter: blur(var(--blur));
  -webkit-backdrop-filter: blur(var(--blur));
  border: 1px solid var(--line);
}
.tilt {
  transform: perspective(1400px) rotateY(-6deg) rotateX(3deg);
  transition: transform .3s ease;
}
.tilt:hover {
  transform: perspective(1400px) rotateY(-2deg) rotateX(1deg);
}
.font-display { font-family: var(--font-display); }
.font-mono { font-family: var(--font-mono); }

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.fade-in { animation: fadeInUp .35s ease both; }
```

- [ ] **Step 4: App.tsx ConfigProvider 切深色 token**

把 `packages/web/src/App.tsx` 中 `ConfigProvider` 的 `theme` 整体替换为:

```tsx
theme={{
  token: {
    borderRadius: 10,
    colorBgBase: '#08090D',
    colorBgLayout: '#08090D',
    colorBgContainer: '#0C0E14',
    colorBgElevated: '#11141B',
    colorBorder: 'rgba(255,255,255,.09)',
    colorBgSpotlight: '#11141B',
    colorText: '#E8EBF1',
    colorTextSecondary: '#9AA0AC',
    colorTextTertiary: '#6B7280',
    colorTextDescription: '#9AA0AC',
    colorPrimary: '#00FFA3',
    colorSuccess: '#00FFA3',
    colorWarning: '#FF8A3D',
    colorError: '#FF5C5C',
    colorLink: '#00FFA3',
    fontFamily: "'Manrope Variable', ui-sans-serif, system-ui, sans-serif",
    fontSize: 13,
  },
  components: {
    List: { colorSplit: 'rgba(255,255,255,.06)' },
    Tree: {
      colorBgContainer: 'transparent',
      nodeHoverBg: 'rgba(255,255,255,.06)',
      nodeSelectedBg: 'rgba(0,255,163,.12)',
      directoryNodeSelectedBg: 'rgba(0,255,163,.12)',
      nodeSelectedColor: '#E8EBF1',
    },
    Button: {
      colorBgContainer: '#0C0E14',
      colorBorder: 'rgba(255,255,255,.09)',
      defaultColor: '#E8EBF1',
      primaryColor: '#06120C',
    },
    Card: { colorBgContainer: 'rgba(255,255,255,.04)', colorBorderSecondary: 'rgba(255,255,255,.09)' },
    Modal: { contentBg: '#0C0E14', headerBg: '#0C0E14', titleColor: '#E8EBF1' },
    Input: { colorBgContainer: '#0C0E14', activeBorderColor: '#00FFA3', hoverBorderColor: 'rgba(0,255,163,.4)' },
    Select: { colorBgContainer: '#0C0E14', optionSelectedBg: 'rgba(0,255,163,.12)' },
    Tooltip: { colorBgSpotlight: '#11141B', colorTextLightSolid: '#E8EBF1' },
    Popover: { colorBgElevated: '#11141B' },
    Tag: { defaultBg: 'rgba(255,255,255,.06)', defaultColor: '#9AA0AC' },
  },
}}
```

- [ ] **Step 5: build 验证**

Run: `pnpm --filter @claude-web/ui build`
Expected: `tsc -b && vite build` 成功,零错误。此时切到 `pnpm dev` 已可见整体深色(AntD 部分),但组件内 inline 浅色尚未替换(后续任务处理)。

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/styles/global.less packages/web/src/main.tsx packages/web/src/App.tsx packages/web/package.json pnpm-lock.yaml
git commit -m "feat(ui): 主题基础设施——深空玻璃 token、自托管字体、AntD 深色"
```

---

## Task 2: markdown 深色化

**Files:**
- Modify: `packages/web/src/styles/markdown.less`

- [ ] **Step 1: 读现状**

Run: 读 `packages/web/src/styles/markdown.less` 全文,识别其中的浅色背景/边框/代码块颜色(如 `#fff`/`#f6f8fa`/`#e8e8ec` 等)。

- [ ] **Step 2: 替换为深色**

把该文件里所有浅色背景改为深色变量、文字改为 `var(--txt)` / `var(--txt-sub)`、边框改 `var(--line)`。代码块背景用 `#0C0E14`、关键字/字符串颜色保留 shiki 主题(代码高亮由 FileViewer 的 shiki 控制,见 Task 8;此处只管 `.markdown` 内联样式)。引用块 `blockquote` 边框用 `var(--acc)`。链接用 `var(--acc)`。

- [ ] **Step 3: build + 目检**

Run: `pnpm --filter @claude-web/ui build` → 成功。dev 目检:任一会话里 assistant 的 markdown 回复(标题/列表/代码/链接)为深色协调。

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/styles/markdown.less
git commit -m "feat(ui): markdown 渲染深色化"
```

---

## Task 3: 布局框架(DesktopLayout + SessionList)

**Files:**
- Modify: `packages/web/src/pages/ProjectPage/DesktopLayout.tsx`
- Modify: `packages/web/src/pages/ProjectPage/components/SessionList.tsx`

- [ ] **Step 1: DesktopLayout 删 C + 换色**

在 `DesktopLayout.tsx`:删除顶部 `const C = {...}`。把文件内所有 `C.bg0`→`var(--bg)`、`C.bg1`→`var(--bg-soft)`、`C.bg3`→`var(--line)`、`C.text0`→`var(--txt)`、`C.text1`→`var(--txt-sub)`、`C.text2`→`var(--txt-dim)`、`C.sidebar`→`var(--bg-soft)`(按颜色映射表)。工具条/状态栏的容器背景用 `var(--bg-soft)`;状态栏"终端"按钮选中态用 `var(--acc-soft)` 底 + `var(--acc)` 文字。

- [ ] **Step 2: SessionList 删 C + 选中态亮绿 + 标题衬线**

在 `SessionList.tsx`:删除 `const C = {...}`,按映射表替换引用。选中会话(`s.id === activeId`)的 `background` 由 `C.bg1` 改为 `var(--acc-soft)`、加 `border: '1px solid var(--acc-line)'`、`boxShadow` 改为 `0 0 0 1px var(--acc-line)`;标题文字色选中时 `var(--txt)`、未选中 `var(--txt-sub)`。项目名(顶部 `projectCwd.split('/').pop()` 的 div)加 `className="font-display"`。`AGENT_COLOR` 的 `claude: 'blue'` 改为 `'green'`(让 Tag 用绿色)。

- [ ] **Step 3: build + 目检**

Run: `pnpm --filter @claude-web/ui build` → 成功。dev 目检 ProjectPage:三栏框架深色、状态栏深色、会话列表选中项亮绿高亮、项目名衬线。

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/ProjectPage/DesktopLayout.tsx packages/web/src/pages/ProjectPage/components/SessionList.tsx
git commit -m "feat(ui): 布局框架与会话列表深色玻璃化"
```

---

## Task 4: 聊天(ChatPanel + MessageBubble + ChatInput)

**Files:**
- Modify: `packages/web/src/components/ChatPanel/index.tsx`
- Modify: `packages/web/src/components/MessageBubble/index.tsx`
- Modify: `packages/web/src/components/ChatInput/index.tsx`

- [ ] **Step 1: ChatPanel 删 C + 标题衬线 + Thinking 玻璃 + AskUserCard 深色**

在 `ChatPanel/index.tsx`:删除 `const C = {...}`,按映射表替换。顶栏 `<Text>{sessionTitle}</Text>` 外层或 Text 加 `className="font-display"`、色 `var(--txt)`;顶栏背景 `var(--bg-soft)`、下边框 `var(--line)`。"Thinking..." 浮层 `background` 由 `'white'` 改为加 `className="glass"`(或 `var(--bg-elev)` + `var(--line)` 边)。`AskUserCard` 的 `style` 里 `background: '#f0f5ff'`→`var(--acc-soft)`、`borderColor: '#1677ff33'`→`var(--acc-line)`;内部 `Tag color="blue"`→`color="green"`;`<span style={{fontSize:12}}>` 标题可加 `className="font-display"`。底部输入区背景 `var(--bg-soft)`、上边框 `var(--line)`;"Human-in-the-loop" 文字色 `var(--txt-dim)`。

- [ ] **Step 2: MessageBubble 气泡 + 工具 chip**

读 `MessageBubble/index.tsx`,按映射表把 inline 浅色替换为变量。用户气泡背景 `var(--glass-2)` + `var(--line)` 边;assistant 气泡透明 + 左侧 `2px solid var(--acc)`;工具调用 chip(`Read/Edit/Bash` 等)背景 `var(--glass)`、边 `var(--line)`、文字 `var(--acc)`(危险/警告类用 `var(--warn)`)。错误结果用 `var(--danger)`。标题/角色标签按需加 `.font-mono`。

- [ ] **Step 3: ChatInput 玻璃输入框 + 补全浮层深色 + 附件卡**

在 `ChatInput/index.tsx`:MentionsInput 的 `style.suggestions.list` 背景 `'#fff'`→`'#0C0E14'`(或 `var(--bg-elev)`)、边 `'#e8e8e8'`→`var(--line)`、`item &focused` 背景 `'#e6f4ff'`→`var(--acc-soft)`;input 边 `'#d9d9d9'`→`var(--line)`、focus 时 `var(--acc-line)`。`@` 的 `backgroundColor:'#e6f4ff'`→`var(--acc-soft)`;`/` 的 `backgroundColor:'#f6ffed'`→`var(--acc-soft)`。附件卡边 `colorBorderSecondary` 用 `var(--line)`、背景 `colorFillAlter`→`var(--glass)`;删除按钮背景保留半透明黑。

- [ ] **Step 4: build + 目检**

Run: `pnpm --filter @claude-web/ui build` → 成功。dev 目检:发一条消息,用户/assistant 气泡玻璃质感、工具 chip 绿色、Thinking 浮层深色玻璃、输入框深色、敲 `/` 与 `@` 浮层深色且选中绿。

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ChatPanel/index.tsx packages/web/src/components/MessageBubble/index.tsx packages/web/src/components/ChatInput/index.tsx
git commit -m "feat(ui): 聊天面板/气泡/输入框深色玻璃化"
```

---

## Task 5: 主页(HomePage + 项目卡 3D)

**Files:**
- Modify: `packages/web/src/pages/HomePage/index.tsx`
- Modify: `packages/web/src/pages/HomePage/index.less`

- [ ] **Step 1: index.less 深色 + 项目卡 3D**

把 `index.less` 内浅色替换:`.homePage` 背景 `#f7f7f8`→`var(--bg)`;`&-header-title` 色 `#1a1a1a`→`var(--txt)`、加 `font-family: var(--font-display)`;`&-subtitle code` 背景 `#eee`→`var(--glass-2)`;各 divider 背景 `#e8e8ec`→`var(--line)`。`.projectCard`:背景 `#fff`→`var(--glass)` + `backdrop-filter: blur(var(--blur))`、边 `#e8e8ec`→`var(--line)`;hover `border-color:#1677ff`→`var(--acc-line)`、`box-shadow` 蓝色 → `0 20px 50px rgba(0,0,0,.45)`、并加 `transform: perspective(1400px) rotateY(-6deg) rotateX(3deg)`(即 `.tilt` 效果,可直接给 `.projectCard` 加这些属性,或 className 加 `tilt`);`&-icon` 背景 `#f0f5ff`→`var(--acc-soft)`;`&-name` 色→`var(--txt)`;`&-path`/`&-meta` 色→`var(--txt-dim)`/`var(--txt-sub)`。

- [ ] **Step 2: index.tsx 颜色 + Hero 衬线**

在 `index.tsx`:`FolderOpenOutlined` 色 `#1677ff`→`var(--acc)`;DirPicker 里 `#f0f9ff/#bae0ff/#0958d9/#1677ff/#e6f4ff/#fafafa/#e8e8e8/#f5f5f5/#fff/#333/#ccc/#aaa` 按映射表替换(蓝→绿系,灰→txt 变量);空状态文字 `#555/#aaa`→`var(--txt-sub)`/`var(--txt-dim)`。`homePage-header-title` 文字"Claude Web"由 less 控制已衬线。

- [ ] **Step 3: build + 目检**

Run: `pnpm --filter @claude-web/ui build` → 成功。dev 目检 `/`:Hero 衬线标题、项目卡 3D 倾斜 + hover 复位、DirPicker/Modal 深色。

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/HomePage/index.tsx packages/web/src/pages/HomePage/index.less
git commit -m "feat(ui): 主页深色化 + 项目卡 3D 透视"
```

---

## Task 6: 右侧面板(RightPanel + 文件树 + FileViewer)

**Files:**
- Modify: `packages/web/src/pages/ProjectPage/components/RightPanel.tsx`
- Modify: `packages/web/src/components/FileTreePanel/index.tsx`
- Modify: `packages/web/src/components/FileViewer/index.tsx`

- [ ] **Step 1: RightPanel + FileTreePanel 深色**

读 `RightPanel.tsx` 与 `FileTreePanel/index.tsx`,按映射表替换 inline 浅色(C 对象/`#xxx`)为变量。tab 选中态用 `var(--acc)` 下划线或 `var(--acc-soft)` 底;搜索框深色。文件树依赖 AntD `Tree`(Task 1 已配 nodeHover/nodeSelected token),容器背景 `var(--bg)`。

- [ ] **Step 2: FileViewer shiki 深色主题**

读 `FileViewer/index.tsx`,找到 shiki `highlighter` / `codeToHtml` 配置,把主题改为深色(如 `'github-dark-dimmed'` 或 `'vitesse-dark'`);容器背景 `var(--bg-soft)`、内边距/圆角用 token。

- [ ] **Step 3: build + 目检**

Run: `pnpm --filter @claude-web/ui build` → 成功。dev 目检:右侧 tab/文件树深色、选中绿、点开一个代码文件 shiki 深色高亮。

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/ProjectPage/components/RightPanel.tsx packages/web/src/components/FileTreePanel/index.tsx packages/web/src/components/FileViewer/index.tsx
git commit -m "feat(ui): 右侧面板/文件树/代码查看深色化"
```

---

## Task 7: 终端 + DiffReview + FullSpin + MobileLayout

**Files:**
- Modify: `packages/web/src/components/Terminal/index.tsx`
- Modify: `packages/web/src/components/DiffReview/index.tsx`
- Modify: `packages/web/src/components/FullSpin/index.tsx`
- Modify: `packages/web/src/pages/ProjectPage/MobileLayout.tsx`

- [ ] **Step 1: Terminal xterm 深色绿主题**

读 `Terminal/index.tsx`,找到 xterm `Terminal` 实例化处的 `theme` 选项(若没有则新增),设为:
```ts
theme: {
  background: '#08090D',
  foreground: '#E8EBF1',
  cursor: '#00FFA3',
  cursorAccent: '#08090D',
  selectionBackground: 'rgba(0,255,163,.2)',
  black: '#08090D', red: '#FF5C5C', green: '#00FFA3', yellow: '#FF8A3D',
  blue: '#5B9DFF', magenta: '#C77DFF', cyan: '#5BE7E7', white: '#E8EBF1',
  brightBlack: '#6B7280', brightRed: '#FF8A8A', brightGreen: '#5BFFC4',
  brightYellow: '#FFB066', brightBlue: '#8FB8FF', brightMagenta: '#DAA6FF',
  brightCyan: '#8FF0F0', brightWhite: '#FFFFFF',
}
```
容器背景/边框用 `var(--bg)` / `var(--line)`。

- [ ] **Step 2: DiffReview + FullSpin + MobileLayout 深色**

读这三个文件,按映射表替换 inline 浅色。DiffReview 的 diff 着色:新增行底 `rgba(0,255,163,.08)`、删除行底 `rgba(255,92,92,.08)`、`+` 前缀 `var(--acc)`、`-` 前缀 `var(--danger)`。FullSpin 背景遮罩用 `rgba(8,9,13,.7)` + spinner `var(--acc)`。MobileLayout 同 DesktopLayout 手法(Task 3)删 C 换色。

- [ ] **Step 3: build + 目检**

Run: `pnpm --filter @claude-web/ui build` → 成功。dev 目检:打开终端面板深色绿光标、diff 视图深色、加载遮罩深色;缩窄视口到移动宽度,MobileLayout 颜色一致。

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/Terminal/index.tsx packages/web/src/components/DiffReview/index.tsx packages/web/src/components/FullSpin/index.tsx packages/web/src/pages/ProjectPage/MobileLayout.tsx
git commit -m "feat(ui): 终端/diff/加载遮罩/移动端深色化"
```

---

## Task 8: 整体验证与收尾

- [ ] **Step 1: 全量 build**

Run: `pnpm --filter @claude-web/ui build`
Expected: `tsc -b && vite build` 成功,零 TS 错误。

- [ ] **Step 2: 全流程目检清单(dev server)**

`pnpm dev`,逐项确认:
- HomePage:Hero 衬线标题、项目卡 3D + hover、DirPicker/Modal 深色、终端深色绿。
- ProjectPage:框架/状态栏深色、会话列表选中绿 + 项目名衬线、聊天玻璃气泡 + 工具 chip 绿、Thinking 玻璃浮层、输入框深色、`/` 与 `@` 补全浮层深色、右侧 tab/文件树深色、代码 shiki 深色、终端深色绿光标。
- 弹层(Tooltip/Popover/Popconfirm/Select/Modal)均深色。
- 缩窄视口 → MobileLayout 颜色一致。
- 断网刷新 → 字体仍正常(自托管验证)。
- 功能未坏:发消息、`/` 命令补全(含动态 skills)、`@` 文件引用、AskUserQuestion 卡片、diff 查看、终端交互。

- [ ] **Step 3: 残留浅色扫描**

Run(grep 残留浅色 inline,排查遗漏):
```bash
grep -rnE "#(fff|ffffff|f7f7f8|e8e8ec|1677ff|e6f4ff|f0f5ff|1a1a1a|f0f9ff)" packages/web/src --include=*.tsx --include=*.less | grep -v node_modules
```
Expected: 仅剩与设计无关的必要项(如图片占位、纯白图标特殊场景);逐一判断是否需改。改完后重跑 build。

- [ ] **Step 4: 最终 Commit(若有收尾改动)**

```bash
git add -A
git commit -m "fix(ui): 重新设计收尾——补齐残留浅色与细节"
```

---

## Self-Review(计划自检)

**1. Spec 覆盖:**
- 色板 token / 字体 / 玻璃 / 3D / 动效 → Task 1(global.less)✓
- AntD ConfigProvider token 映射 → Task 1(App.tsx)✓
- markdown 深色 → Task 2 ✓
- 组件清单全部覆盖:DesktopLayout/SessionList(Task 3)、ChatPanel/MessageBubble/ChatInput(Task 4)、HomePage+less(Task 5)、RightPanel/FileTreePanel/FileViewer(Task 6)、Terminal/DiffReview/FullSpin/MobileLayout(Task 7)✓
- 字体自托管 → Task 1 Step 1-2 ✓
- 一次性全应用 → Task 3-7 全组件 ✓
- 验证(build + 目检 + 离线 + 功能)→ 各 Task Step + Task 8 ✓

**2. 占位扫描:** 无 TBD/TODO;每个 Step 都有具体改动点或完整代码;颜色映射表覆盖所有遇到的浅色值。xterm theme、global.less、App.tsx token 均为完整代码。

**3. 类型/命名一致性:** CSS 变量名(`--bg/--bg-soft/--glass/--line/--txt/--txt-sub/--txt-dim/--acc/--acc-soft/--acc-line/--warn/--danger/--radius` 等)在 Task 1 定义,Task 2-7 引用一致;`.glass`/`.tilt`/`.font-display`/`.font-mono` 工具类名跨任务一致。

无缺口。计划可执行。
