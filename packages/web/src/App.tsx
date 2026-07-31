import { Routes, Route } from 'react-router-dom'
import { ConfigProvider, App as AntdApp } from 'antd'
import HomePage from '@/pages/HomePage/index.tsx'
import ProjectPage from '@/pages/ProjectPage/index.tsx'

export default function App() {
  return (
    <ConfigProvider
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
    >
      <AntdApp>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/project/:projectId" element={<ProjectPage />} />
        </Routes>
      </AntdApp>
    </ConfigProvider>
  )
}
