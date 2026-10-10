import { Outlet } from 'react-router-dom';
import { Typography } from 'antd';

const { Title, Text } = Typography;

export default function AuthLayout() {
  return (
    <div className="tl-auth-layout">
      {/* Left brand panel — hidden on mobile */}
      <div
        className="tl-auth-side-panel flex flex-col justify-center px-16 py-12"
        style={{ background: '#12233F' }}
      >
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex items-center justify-center font-black text-brand tracking-tighter" style={{ fontSize: '24px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                <path d="M4 8l8-4 8 4M4 16l8 4 8-4M4 12l8 4 8-4" />
              </svg>
              SAMETA
            </div>
          </div>
          <h1 className="text-white text-4xl font-bold leading-tight mb-4">
            Every partner connected.<br />Every order in view.
          </h1>
          <p className="text-white/60 text-lg leading-relaxed">
            One platform connecting vendors, customers, and commerce.
          </p>
        </div>

        {/* Feature bullets */}
        <div className="space-y-3">
          {[
            'Live machine board & production logs',
            'Roll-level QC & full traceability',
            'Validated scan-to-dispatch',
            'Buyer live status & OTP delivery',
            'Cost per order & monthly P&L',
          ].map(f => (
            <div key={f} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-brand/30 flex items-center justify-center flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-brand" />
              </div>
              <span className="text-white/75 text-sm">{f}</span>
            </div>
          ))}
        </div>

        <div className="mt-auto pt-12 text-white/30 text-xs">
          Secure, authenticated access.
        </div>
      </div>

      {/* Right form panel */}
      <div className="tl-auth-form-panel">
        <div className="tl-auth-form-inner">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="flex items-center justify-center font-black text-brand tracking-tighter" style={{ fontSize: '22px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                <path d="M4 8l8-4 8 4M4 16l8 4 8-4M4 12l8 4 8-4" />
              </svg>
              SAMETA
            </div>
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
