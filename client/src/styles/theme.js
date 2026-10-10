// SAMETA AntD theme
export const theme = {
  token: {
    colorPrimary: '#007780',
    colorPrimaryHover: '#005E65',
    colorSuccess: '#18794E',
    colorWarning: '#F08C00',
    colorError: '#B42318',
    colorInfo: '#1D4ED8',
    colorTextBase: '#182B45',
    colorTextSecondary: '#53657A',
    colorBgLayout: '#F5F7F9',
    colorBgContainer: '#FFFFFF',
    colorBorder: '#DCE4EA',
    borderRadius: 8,
    borderRadiusLG: 10,
    borderRadiusSM: 4,
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    fontSize: 14,
    fontSizeLG: 16,
    lineHeight: 1.6,
    controlHeight: 36,
    controlHeightLG: 44,
    motion: true,
    motionDurationMid: '0.15s',
    motionDurationSlow: '0.2s',
  },
  components: {
    Layout: {
      headerBg: '#FFFFFF',
      siderBg: '#12233F',
      bodyBg: '#F4F6F8',
      headerHeight: 64,
    },
    Menu: {
      darkItemBg: 'transparent',
      darkSubMenuItemBg: 'transparent',
      darkItemSelectedBg: '#006B73',
      darkItemColor: 'rgba(255,255,255,0.75)',
      darkItemHoverColor: '#FFFFFF',
      darkItemSelectedColor: '#FFFFFF',
      itemBorderRadius: 6,
    },
    Button: {
      controlHeightLG: 56,
      fontSizeLG: 18,
      defaultBg: '#FFFFFF',
      defaultBorderColor: '#DCE3E9',
    },
    Table: {
      headerBg: '#F8F9FA',
      headerColor: '#536278',
      rowHoverBg: '#F4F6F8',
      borderColor: '#DCE3E9',
      fontSize: 14,
    },
    Card: {
      headerBg: '#FFFFFF',
    },
    Input: {
      activeBorderColor: '#006B73',
      hoverBorderColor: '#006B73',
    },
    Select: {
      optionSelectedBg: '#E6F4F5',
    },
    Tag: {
      defaultBg: '#F4F6F8',
    },
    Tabs: {
      inkBarColor: '#006B73',
      itemActiveColor: '#006B73',
      itemSelectedColor: '#006B73',
    },
    Steps: {
      colorPrimary: '#006B73',
    },
    Progress: {
      defaultColor: '#006B73',
    },
  },
};
