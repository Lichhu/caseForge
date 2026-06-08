import type { ThemeConfig } from 'ant-design-vue/es/config-provider/context';

/** CaseForge 全局 Ant Design 主题，与 app.less 设计变量保持一致 */
export const caseForgeTheme: ThemeConfig = {
  token: {
    colorPrimary: '#b60f2d',
    colorPrimaryHover: '#8f0b20',
    colorPrimaryActive: '#7a091b',
    colorLink: '#b60f2d',
    colorLinkHover: '#8f0b20',
    colorError: '#b42318',
    colorErrorHover: '#912018',
    colorErrorBorder: '#f4a4ad',
    colorErrorBg: '#fff5f6',
    colorSuccess: '#027a48',
    colorWarning: '#b54708',
    colorText: '#344054',
    colorTextHeading: '#1d2939',
    colorTextSecondary: '#667085',
    colorTextTertiary: '#98a2b3',
    colorBorder: '#d0d5dd',
    colorBorderSecondary: '#e4e7ec',
    colorBgContainer: '#ffffff',
    colorBgLayout: '#f4f6f9',
    colorBgElevated: '#ffffff',
    borderRadius: 6,
    borderRadiusSM: 4,
    borderRadiusLG: 8,
    controlHeight: 36,
    controlHeightSM: 32,
    fontSize: 14,
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    boxShadow: '0 1px 2px rgb(16 24 40 / 4%)',
    boxShadowSecondary: '0 4px 12px rgb(16 24 40 / 6%)',
    zIndexPopupBase: 2600,
  },
};
