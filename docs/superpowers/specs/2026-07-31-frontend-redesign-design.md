# AgentDock 前端重新设计 · 设计文档(spec)

> 日期:2026-07-31 · 状态:待审阅
> 主题:把 AgentDock web UI 整体重塑为「Deep Glass × Serif Voice」——深空玻璃态配色 + Fraunces 衬线标题。

## 1. Context(为什么)

AgentDock 当前前端是浅色 Ant Design 默认风(白底、蓝 `#1677ff`、圆角 6、无个性字体),视觉上属于「AI 套路」——通用、缺乏性格。用户希望参考一张任务管理 App 截图(深黑底 + 亮绿强调 + 玻璃态 + 3D 堆叠卡片),把**整个应用**重新设计成更有辨识度的方向。

经两轮浏览器 mockup 共创,锁定方向为**混搭**:
- **配色**取自参考图:深空玻璃态(近黑底 + 毛玻璃半透明面板 + 亮绿 `#00FFA3` 强调)。
- **字体**取衬线大标题(Fraunces),浓度 = 「Hero + 区块标题」(正文与界面仍用无衬线 Manrope)。

两个落地决策(用户已拍板):**字体本地自托管**(离线/内网可用)、**一次性全应用改造**。

预期结果:所有页面与组件统一为深色玻璃态视觉语言,衬线标题提供编辑感节奏,亮绿做焦点;离线可用;不破坏任何现有功能。

---

## 2. 设计决策(锁定项)

| 维度 | 决策 |
|---|---|
| 整体气质 | 深空玻璃态 × 衬线标题;赛博未来 + 编辑高级感的反差 |
| 底色 | 近黑 `#08090D`(+ 次级 `#0C0E14`)+ 径向亮绿光晕 |
| 面板 | 半透明玻璃 `rgba(255,255,255,.04)` + `backdrop-filter: blur(10px)` + 细亮边 |
| 强调色 | 亮绿 `#00FFA3`(焦点/选中/进度/链接/工具标签);琥珀 `#FF8A3D` 作二级/警告 |
| 文字 | 主 `#E8EBF1` / 次 `#9AA0AC` / 更次 `#6B7280` |
| 标题字体 | Fraunces(衬线),用于页面 Hero 与区块标题(会话/对话/文件/项目名) |
| UI 字体 | Manrope(正文、控件、列表) |
| 等宽字体 | JetBrains Mono(代码、路径、工具标签、状态栏) |
| 3D 透视 | 主页项目卡 + 选中会话卡:`perspective + rotateY/X`,hover 复位 |
| 圆角 | 卡片/面板 `10px`,小元素 `6px`,输入/气泡 `10px` |
| 动效 | 入场淡入 stagger、面板展开过渡、卡片 hover 3D、消息/气泡入场 |
| 字体加载 | 本地自托管(经 `@fontsource` npm 包,woff2 打包,离线可用) |
| 范围 | 一次性全应用(所有页面与组件) |

---

## 3. 视觉规范

### 3.1 色板 token(CSS 变量,定义在 `styles/global.less` 的 `:root`)

```less
:root {
  /* 底 */
  --bg:        #08090D;
  --bg-soft:   #0C0E14;
  --bg-elev:   #11141B;
  /* 玻璃 */
  --glass:     rgba(255,255,255,.04);
  --glass-2:   rgba(255,255,255,.06);
  --line:      rgba(255,255,255,.09);
  --line-soft: rgba(255,255,255,.06);
  /* 文字 */
  --txt:       #E8EBF1;
  --txt-sub:   #9AA0AC;
  --txt-dim:   #6B7280;
  /* 强调 */
  --acc:       #00FFA3;
  --acc-soft:  rgba(0,255,163,.12);
  --acc-line:  rgba(0,255,163,.30);
  --acc-ink:   #06120C;   /* 强调底上的文字 */
  --warn:      #FF8A3D;
  --danger:    #FF5C5C;
  /* 形 */
  --radius:    10px;
  --radius-sm: 6px;
  --shadow:    0 20px 50px rgba(0,0,0,.45);
  --blur:      10px;
}
```

### 3.2 字体

- 通过 npm 安装:`@fontsource-variable/fraunces`、`@fontsource-variable/manrope`、`@fontsource-variable/jetbrains-mono`(variable 字重,体积可控)。在 `main.tsx` 顶部 `import` 即自托管。
- font-family 栈:
  - 显示(衬线):`'Fraunces Variable', ui-serif, Georgia, serif`
  - 界面(无衬线):`'Manrope Variable', ui-sans-serif, system-ui, sans-serif`
  - 等宽:`'JetBrains Mono Variable', ui-monospace, monospace`
- 工具 class:`.font-display`(衬线)、`.font-mono`(等宽);默认 body = Manrope。

### 3.3 玻璃 & 3D 工具类

```less
.glass {
  background: var(--glass);
  backdrop-filter: blur(var(--blur));
  -webkit-backdrop-filter: blur(var(--blur));
  border: 1px solid var(--line);
}
.tilt { transform: perspective(1400px) rotateY(-6deg) rotateX(3deg); transition: transform .3s ease; }
.tilt:hover { transform: perspective(1400px) rotateY(-2deg) rotateX(1deg); }
```

### 3.4 动效

- `@keyframes fadeInUp`(opacity 0→1, translateY 8px→0),配 `animation-delay` 做 stagger(列表项、卡片、消息)。
- AntD `Splitter` 面板展开走原生过渡;终端面板高度过渡。
- 卡片 hover 用 `.tilt`。

---

## 4. 技术落地

### 4.1 主题层(三处入口)

1. **`styles/global.less`** — `:root` 变量 + body 深色基底 + 径向光晕背景 + 滚动条深色样式 + `.glass`/`.tilt`/`.font-*` 工具类 + `fadeInUp` keyframes。当前该文件只有 reset,扩展它。
2. **`src/App.tsx` 的 `ConfigProvider`** — token 改深色 + 绿 + Manrope:
   - `colorBgBase/colorBgLayout: #08090D`,`colorBgContainer: #0C0E14`,`colorBgElevated: #11141B`(弹层)
   - `colorText: #E8EBF1`,`colorTextSecondary: #9AA0AC`,`colorBorder: rgba(255,255,255,.09)`
   - `colorPrimary: #00FFA3`,`colorSuccess: #00FFA3`,`colorWarning: #FF8A3D`,`colorError: #FF5C5C`
   - `fontFamily: Manrope 栈`,`fontSize: 13`,`borderRadius: 10`
   - 组件级 token:`Tree`(nodeHoverBg=var(--glass-2)、nodeSelectedBg=var(--acc-soft))、`Button`、`List`(colorSplit=var(--line-soft))、`Card`、`Modal`、`Tag` 等。
3. **`main.tsx`** — `import` 三个 `@fontsource-variable/*`。

### 4.2 组件改造模式(统一手法)

每个组件当前都有一个本地 `C` 对象(`bg0/bg1/bg3/text0/text1/text2` 等浅色常量)与大量 inline `#1677ff/#fff/#1a1a1a/#888/#bbb/#e8e8ec/#f0f5ff/#e6f4ff`。

统一改造:
- **删除**各文件 `C` 对象,inline 颜色替换为 `var(--xxx)`(背景容器改加 `className="glass"` 或实色 `var(--bg-soft)`)。
- **区块标题**(会话/对话/文件/项目名/页面标题)套 `.font-display`(衬线)。
- 代码/路径/工具标签/时间套 `.font-mono`。
- 选中态用 `var(--acc-soft)` 底 + `var(--acc-line)` 边 + 主色文字;hover 用 `var(--glass-2)`。
- 蓝色交互(`#1677ff`/`#e6f4ff`/`#f0f5ff`)统一换成绿色系(`var(--acc)`/`var(--acc-soft)`)。

### 4.3 改造文件清单(全应用)

页面与布局:
- `pages/HomePage/index.tsx` + `pages/HomePage/index.less`(Hero 衬线标题、项目卡 `.tilt` 3D、DirPicker 深色、Modal/Spin)
- `pages/ProjectPage/index.tsx`、`DesktopLayout.tsx`、`MobileLayout.tsx`(整体框架、工具条、状态栏)
- `pages/ProjectPage/components/SessionList.tsx`(选中态亮绿、标题衬线)
- `pages/ProjectPage/components/RightPanel.tsx`(tab、diff 着色、标题)

组件:
- `components/ChatPanel/index.tsx`(顶栏衬线标题、Thinking 浮层玻璃、AskUserCard 深色、发送按钮)
- `components/ChatInput/index.tsx`(玻璃输入框、`@`/`/` 补全浮层深色、附件卡)
- `components/MessageBubble/index.tsx`(玻璃气泡、工具调用绿色 chip、markdown 代码块深色)
- `components/FileTreePanel/index.tsx`、`components/FileViewer/index.tsx`(shiki 深色主题)
- `components/Terminal/index.tsx`(xterm `theme` 配深色绿:背景 `#08090D`、前景 `#E8EBF1`、cursor/亮绿 `#00FFA3`)
- `components/DiffReview/index.tsx`、`components/FullSpin/index.tsx`

样式:
- `styles/global.less`(主题 token + 工具类,核心)
- `styles/markdown.less`(代码块/引用/链接深色化)

### 4.4 注意事项 / AntD 深色坑

- AntD 弹层(Dropdown/Popover/Tooltip/Modal/Popconfirm/Select)依赖 `colorBgElevated`,token 设 `#11141B` 即可;个别(Tooltip)可能需局部 CSS 覆盖背景。
- `colorBgContainer` 用实色 `#0C0E14` 而非透明,避免 Menu/List 透明叠加发灰;**玻璃质感只用在自定义容器**(`.glass`),不强制 AntD 容器透明。
- xterm、shiki 各自有主题配置,需单独设深色。
- `backdrop-filter` 在部分浏览器需 `-webkit-` 前缀(已在 `.glass` 加);性能上仅用于数量有限的卡片/面板。

---

## 5. 风险与回退

- **功能回归**:纯视觉改造,不改逻辑/数据流;主要风险是漏改某处 inline 颜色导致浅色残留——靠逐组件清单 + 跑一遍各页面目检。
- **AntD 组件深色不完美**:个别组件需局部覆盖;若某组件改不动,保持深色实色兜底即可,不阻塞。
- **字体体积**:三个 variable 字体 woff2 合计约 0.5–1MB,首屏加载一次后缓存;可接受。
- **回退**:改造集中在 `global.less`(token)+ `App.tsx`(token)+ 各组件 inline 颜色;git 上是一个 feat 提交,不满意可整体 revert,不影响后端与会话数据。

---

## 6. 验证

1. `pnpm --filter @claude-web/ui build`(`tsc -b && vite build`)通过——含此前修复的 `useProjectPage` 类型问题后应零错误。
2. `pnpm dev` 起服务,逐页目检:
   - **HomePage**:Hero 衬线标题、项目卡 3D 倾斜 + hover 复位、DirPicker/Modal 深色、终端深色绿主题。
   - **ProjectPage**:会话列表选中亮绿、区块标题衬线、聊天玻璃气泡、工具标签绿/琥珀、文件树深色、输入框玻璃 + `/` 补全浮层深色、终端面板深色。
   - 弹层(Tooltip/Popover/Popconfirm/Select 下拉/Modal)均为深色。
3. 切换 MobileLayout 视口,确认移动端布局颜色一致。
4. 确认离线(断网)下字体仍正常(自托管验证)。
5. 确认现有功能未受影响:发消息、`/` 命令补全、`@` 文件引用、AskUserQuestion 卡片、diff 查看、终端交互。
