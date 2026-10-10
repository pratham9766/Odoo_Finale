// Line icons (24px grid, stroke = currentColor) for the navigation and dashboard.
const PATHS = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" /></>,
  orders: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 3v2h6V3M9 10h6M9 14h6M9 18h3" /></>,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.4c2 .8 3.5 2.8 3.5 5.6" /></>,
  person: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>,
  box: <><path d="M12 2.8 20.5 7.5v9L12 21.2 3.5 16.5v-9L12 2.8Z" /><path d="M3.8 7.6 12 12l8.2-4.4M12 12v9" /></>,
  receipt: <><path d="M6 2.8h12v18.4l-3-2-3 2-3-2-3 2V2.8Z" /><path d="M9 8h6M9 12h6" /></>,
  layers: <><path d="M12 3 2.5 8 12 13l9.5-5L12 3Z" /><path d="m2.5 12.5 9.5 5 9.5-5M2.5 17l9.5 5 9.5-5" /></>,
  loom: <><path d="M4 21V8M20 21V8M2.5 8h19M6 4h12v4H6zM7 12h10M7 16h10M9 12v9M15 12v9" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2.8h6V4M9 10h6M9 14h4" /><circle cx="16" cy="17" r="2.2" /></>,
  wrench: <path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 6.3-6.3m-1.6-5.4L13 4 3 14l3 3 1.7-1.7M14.7 6.3a4 4 0 0 1 5-3.3l-2.7 2.7.3 2.6 2.6.3 2.7-2.7" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v2.6M12 18.9v2.6M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2.5 12h2.6M18.9 12h2.6M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /><circle cx="12" cy="12" r="6.5" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12.3 2.7 2.7L16.2 9.5" /></>,
  truck: <><path d="M2.5 6h11v10h-11zM13.5 9.5h4l3 3.5v3h-7" /><circle cx="7" cy="17.5" r="2" /><circle cx="17" cy="17.5" r="2" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  wallet: <><path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h12v3" /><rect x="3.5" y="7.5" width="17" height="12" rx="2" /><path d="M16 13.5h2" /></>,
  chart: <><path d="M4 20V10M10 20V5M16 20v-7M21 20H3" /></>,
  bank: <><path d="M3 9.5 12 4l9 5.5M5 10v8M9.7 10v8M14.3 10v8M19 10v8M3 20.5h18" /></>,
  shield: <><path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6L12 3Z" /><path d="m9 12 2 2 4-4" /></>,
  sliders: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  factory: <><path d="M3 21V10l5 3V10l5 3V5h4l1 16" /><path d="M3 21h18M7 17h2M12 17h2" /></>,
  bell: <><path d="M18 8.5a6 6 0 0 0-12 0c0 7-3 8.5-3 8.5h18s-3-1.5-3-8.5" /><path d="M13.7 20.5a2 2 0 0 1-3.4 0" /></>,
  logout: <><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M9.5 16.5 5 12l4.5-4.5M5 12h11" /></>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.4v.1" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></>,
  warning: <><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4M12 17.2v.1" /></>,
  gauge: <><path d="M20.5 12a8.5 8.5 0 1 1-4.3-7.4" /><path d="M20.5 4.5 12 12" /></>,
  roll: <><ellipse cx="8" cy="12" rx="4" ry="7" /><path d="M8 5h9c2.2 0 4 3.1 4 7s-1.8 7-4 7H8" /><ellipse cx="8" cy="12" rx="1.3" ry="2.3" /></>,
  rupee: <path d="M6 4h12M6 8.5h12M9.5 4c5.5 0 5.5 9 0 9H6l8.5 7.5" />,
  database: <><ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" /><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  cart: <><path d="M3 4h2l2.2 10.5a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2" /><circle cx="9.5" cy="19.5" r="1.3" /><circle cx="17" cy="19.5" r="1.3" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
};

export default function Icon({ name, size = 20, strokeWidth = 1.7, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {PATHS[name] || PATHS.box}
    </svg>
  );
}
