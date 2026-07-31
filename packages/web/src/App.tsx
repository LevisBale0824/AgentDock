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
          colorBgBase: '#FFFFFF',
          colorBgLayout: '#FAFAFA',
          colorBgContainer: '#FFFFFF',
          colorBgElevated: '#FFFFFF',
          colorBorder: '#E4E4E7',
          colorBgSpotlight: '#27272A',
          colorText: '#18181B',
          colorTextSecondary: '#52525B',
          colorTextTertiary: '#71717A',
          colorTextDescription: '#71717A',
          colorPrimary: '#3B5BDF',
          colorSuccess: '#16A34A',
          colorWarning: '#D97706',
          colorError: '#DC2626',
          colorLink: '#3B5BDF',
          fontFamily: "'Manrope Variable', ui-sans-serif, system-ui, sans-serif",
          fontSize: 13,
        },
        components: {
          List: { colorSplit: '#F0F0F1' },
          Tree: {
            colorBgContainer: 'transparent',
            nodeHoverBg: 'rgba(0,0,0,.04)',
            nodeSelectedBg: 'rgba(59,91,223,.10)',
            directoryNodeSelectedBg: 'rgba(59,91,223,.10)',
            nodeSelectedColor: '#18181B',
          },
          Button: {
            colorBgContainer: '#FFFFFF',
            colorBorder: '#E4E4E7',
            defaultColor: '#18181B',
            primaryColor: '#FFFFFF',
          },
          Card: { colorBgContainer: '#FFFFFF', colorBorderSecondary: '#E4E4E7' },
          Modal: { contentBg: '#FFFFFF', headerBg: '#FFFFFF', titleColor: '#18181B' },
          Input: { colorBgContainer: '#FFFFFF', activeBorderColor: '#3B5BDF', hoverBorderColor: 'rgba(59,91,223,.4)' },
          Select: { colorBgContainer: '#FFFFFF', optionSelectedBg: 'rgba(59,91,223,.10)' },
          Tooltip: { colorBgSpotlight: '#27272A', colorTextLightSolid: '#FFFFFF' },
          Popover: { colorBgElevated: '#FFFFFF' },
          Tag: { defaultBg: 'rgba(0,0,0,.04)', defaultColor: '#52525B' },
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
