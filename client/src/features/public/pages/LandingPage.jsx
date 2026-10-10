import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Typography, Drawer } from 'antd';
import { 
  MenuOutlined, CheckCircleFilled, BarChartOutlined, 
  DeploymentUnitOutlined, FileSearchOutlined, TeamOutlined, DesktopOutlined,
  ArrowRightOutlined, RightOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;

const WORKFLOW_STAGES = [
  { step: '1', title: 'Receive materials', desc: 'Log yarn and raw goods instantly upon arrival.', icon: <DeploymentUnitOutlined /> },
  { step: '2', title: 'Plan and produce', desc: 'Schedule machines and track daily output.', icon: <DesktopOutlined /> },
  { step: '3', title: 'Inspect and trace', desc: 'Quality check every roll with full lot tracing.', icon: <FileSearchOutlined /> },
  { step: '4', title: 'Pack and dispatch', desc: 'Scan rolls onto vehicles accurately.', icon: <CheckCircleFilled /> },
  { step: '5', title: 'Update customers', desc: 'Provide live statuses without phone calls.', icon: <TeamOutlined /> },
  { step: '6', title: 'Understand costs', desc: 'Track profitability across every order.', icon: <BarChartOutlined /> },
];

const CAPABILITIES = [
  { title: 'Know what is available.', desc: 'Check stock and reservations before committing production.' },
  { title: 'Trace every roll.', desc: 'Follow a roll’s production, inspection and dispatch history.' },
  { title: 'Keep customers informed.', desc: 'Share order progress without repeated phone calls.' },
];

const STAKEHOLDERS = [
  { role: 'Manufacturers', desc: 'Centralize production, inventory, QC and floor operations in one connected system.' },
  { role: 'Vendors and suppliers', desc: 'Receive purchase orders and confirm goods receipts transparently.' },
  { role: 'Customers and buyers', desc: 'Track live order status, shipment dispatch proofs and due invoices.' },
  { role: 'Logistics partners', desc: 'Get accurate trip assignments and manage OTP-based delivery proofs.' },
];

function Logo({ dark = false }) {
  return (
    <div className={`flex items-center gap-2 font-black tracking-tighter ${dark ? 'text-white' : 'text-[#14243E]'}`} style={{ fontSize: '24px' }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, color: '#007780' }}>
        <path d="M4 8l8-4 8 4M4 16l8 4 8-4M4 12l8 4 8-4" />
      </svg>
      SAMETA
    </div>
  );
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={{ background: '#F5F7F9', minHeight: '100dvh', fontFamily: 'Inter, sans-serif' }}>
      {/* Navigation */}
      <nav style={{ background: '#FFFFFF', borderBottom: '1px solid #DCE4EA', position: 'sticky', top: 0, zIndex: 100 }}>
        <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 max-w-[1440px] mx-auto h-[60px] md:h-[72px]">
          <div className="flex items-center gap-8">
            <Link to="/"><Logo /></Link>
            
            <div className="hidden md:flex items-center gap-6">
              <a href="#product" className="text-[#53657A] hover:text-[#007780] font-medium transition-colors">Product</a>
              <a href="#workflow" className="text-[#53657A] hover:text-[#007780] font-medium transition-colors">How it works</a>
              <a href="#roles" className="text-[#53657A] hover:text-[#007780] font-medium transition-colors">Who it serves</a>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-4">
            <Link to="/login">
              <Button type="text" style={{ color: '#182B45', fontWeight: 500 }}>Sign in</Button>
            </Link>
            <Link to="/login">
              <Button type="primary" style={{ background: '#007780', fontWeight: 500 }}>Get started</Button>
            </Link>
          </div>

          <div className="md:hidden flex items-center">
            <Button type="text" icon={<MenuOutlined />} onClick={() => setMenuOpen(true)} size="large" />
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      <Drawer placement="left" onClose={() => setMenuOpen(false)} open={menuOpen} width={280}>
        <div className="flex flex-col gap-6 pt-4">
          <a href="#product" onClick={() => setMenuOpen(false)} className="text-lg font-medium text-[#182B45]">Product</a>
          <a href="#workflow" onClick={() => setMenuOpen(false)} className="text-lg font-medium text-[#182B45]">How it works</a>
          <a href="#roles" onClick={() => setMenuOpen(false)} className="text-lg font-medium text-[#182B45]">Who it serves</a>
          <div className="h-px bg-[#DCE4EA] w-full" />
          <Link to="/login" onClick={() => setMenuOpen(false)} className="text-lg font-medium text-[#182B45]">Sign in</Link>
          <Link to="/login" onClick={() => setMenuOpen(false)}>
            <Button type="primary" size="large" block style={{ background: '#007780' }}>Get started</Button>
          </Link>
        </div>
      </Drawer>

      {/* Hero */}
      <section className="bg-[#F5F7F9] py-10 sm:py-16 lg:py-20 border-b border-[#DCE4EA]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row gap-12 lg:gap-16 items-center">
            
            {/* Left: Message & Actions (45%) */}
            <div className="w-full lg:w-[45%]">
              <div className="text-[#007780] font-bold tracking-widest text-xs mb-4 uppercase">Connected Business Operations</div>
              <h1 className="text-[#14243E] font-extrabold leading-tight mb-4" style={{ fontSize: 'clamp(34px, 5vw, 56px)' }}>
                Every partner connected.<br/>
                Every order in view.
              </h1>
              <p className="text-[#182B45] font-semibold text-lg sm:text-xl mb-4 leading-snug">
                One platform connecting vendors, customers, and commerce.
              </p>
              <p className="text-[#53657A] text-base sm:text-lg mb-8 leading-relaxed max-w-lg">
                Coordinate inventory, production, quality checks and dispatch—with clear order updates for your customers.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <Link to="/login">
                  <Button type="primary" size="large" style={{ background: '#007780', height: 56, paddingInline: 32, fontSize: 16, fontWeight: 600 }}>
                    Get started
                  </Button>
                </Link>
                <a href="#workflow">
                  <Button size="large" style={{ height: 56, paddingInline: 32, fontSize: 16, fontWeight: 500, borderColor: '#DCE4EA', color: '#182B45' }}>
                    See how it works
                  </Button>
                </a>
              </div>
            </div>

            {/* Right: Conceptual Product Visual (55%) */}
            <div className="w-full lg:w-[55%]">
              <div className="bg-white rounded-xl shadow-xl shadow-[#14243E]/5 border border-[#DCE4EA] overflow-hidden p-8">
                <div className="flex flex-col gap-6 relative">
                  
                  {/* Connecting Line */}
                  <div className="absolute left-6 top-10 bottom-10 w-0.5 bg-[#DCE4EA] hidden sm:block"></div>

                  {[
                    { label: 'Materials', text: 'Receive & trace', active: true },
                    { label: 'Production', text: 'Execute orders', active: true },
                    { label: 'Quality', text: 'Inspect items', active: true },
                    { label: 'Dispatch', text: 'Deliver goods', active: false },
                    { label: 'Customer', text: 'Notify buyer', active: false }
                  ].map((stage, idx) => (
                    <div key={idx} className="flex items-center gap-6 relative z-10">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                        stage.active 
                          ? 'border-[#007780] bg-[#007780] text-white' 
                          : 'border-[#DCE4EA] bg-[#F5F7F9] text-[#53657A]'
                      }`}>
                        {stage.active ? <CheckCircleFilled className="text-xl" /> : <span className="font-bold">{idx + 1}</span>}
                      </div>
                      <div className={`flex-1 p-4 rounded-lg border ${
                        stage.active ? 'bg-[#E8F5F3] border-[#007780]/30' : 'bg-[#F5F7F9] border-[#DCE4EA]'
                      }`}>
                        <div className={`font-bold ${stage.active ? 'text-[#007780]' : 'text-[#53657A]'}`}>{stage.label}</div>
                        <div className="text-[#182B45] text-sm font-medium mt-1">{stage.text}</div>
                      </div>
                    </div>
                  ))}
                  
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Connected Workflow */}
      <section id="workflow" className="py-16 sm:py-20 lg:py-24 bg-white">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-[#14243E] font-bold text-3xl sm:text-4xl mb-4">From material receipt to customer delivery.</h2>
            <p className="text-[#53657A] text-lg sm:text-xl">One connected workflow, with clear handoffs at every step.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {WORKFLOW_STAGES.map((w) => (
              <div key={w.step} className="flex gap-4 p-6 rounded-xl border border-[#DCE4EA] bg-[#F5F7F9] hover:border-[#007780] transition-colors">
                <div className="w-12 h-12 rounded-lg bg-[#E8F5F3] text-[#007780] flex items-center justify-center text-xl flex-shrink-0">
                  {w.icon}
                </div>
                <div>
                  <div className="text-xs font-bold text-[#007780] mb-1">STAGE {w.step}</div>
                  <h3 className="text-lg font-bold text-[#182B45] mb-2">{w.title}</h3>
                  <p className="text-[#53657A] leading-relaxed">{w.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section id="product" className="py-16 sm:py-20 lg:py-24 bg-[#14243E] text-white">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="font-bold text-3xl sm:text-4xl mb-12 text-white">Operational clarity across your business.</h2>
              <div className="space-y-8">
                {CAPABILITIES.map((c, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="mt-1"><CheckCircleFilled style={{ color: '#007780', fontSize: 20 }} /></div>
                    <div>
                      <h4 className="text-xl font-bold mb-2 text-white">{c.title}</h4>
                      <p className="text-white/70 text-lg">{c.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Visual element */}
            <div className="bg-white/5 rounded-2xl p-8 border border-white/10 shadow-2xl">
              <div className="bg-[#F5F7F9] rounded-lg overflow-hidden border border-[#DCE4EA]">
                <div className="px-4 py-3 bg-white border-b border-[#DCE4EA] flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#182B45]/20"></div>
                  <div className="w-3 h-3 rounded-full bg-[#182B45]/20"></div>
                  <div className="w-3 h-3 rounded-full bg-[#182B45]/20"></div>
                </div>
                <div className="p-6">
                  <div className="h-4 w-1/3 bg-[#DCE4EA] rounded mb-6"></div>
                  <div className="space-y-4">
                    <div className="h-12 w-full bg-white rounded border border-[#DCE4EA]"></div>
                    <div className="h-12 w-full bg-white rounded border border-[#DCE4EA]"></div>
                    <div className="h-12 w-3/4 bg-white rounded border border-[#DCE4EA]"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Who it serves */}
      <section id="roles" className="py-16 sm:py-20 lg:py-24 bg-white">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-[#14243E] font-bold text-3xl sm:text-4xl mb-4">Built for every partner in the chain.</h2>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STAKEHOLDERS.map((s, i) => (
              <div key={i} className="p-6 rounded-xl bg-white border border-[#DCE4EA] shadow-sm flex flex-col">
                <h4 className="text-lg font-bold text-[#182B45] mb-3">{s.role}</h4>
                <p className="text-[#53657A] leading-relaxed flex-1">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 sm:py-20 lg:py-24 bg-[#E8F5F3] border-y border-[#007780]/20 text-center">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-[#14243E] font-extrabold text-3xl sm:text-4xl mb-6">
            Bring your business workflow together.
          </h2>
          <p className="text-[#182B45] text-lg sm:text-xl mb-10">
            Connect your partners and coordinate operations with SAMETA.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/login">
              <Button type="primary" size="large" style={{ background: '#007780', height: 56, paddingInline: 40, fontSize: 18, fontWeight: 600 }}>
                Create account <ArrowRightOutlined />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="large" style={{ height: 56, paddingInline: 40, fontSize: 18, fontWeight: 500, borderColor: '#DCE4EA', color: '#182B45' }}>
                Sign in
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#14243E] pt-12 pb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1440px] mx-auto text-center">
          <div className="flex justify-center mb-6">
            <Logo dark />
          </div>
          <p className="text-white/60 text-lg mb-8 font-medium">One platform connecting vendors, customers, and commerce.</p>
          <div className="h-px w-full max-w-sm mx-auto bg-white/10 mb-8" />
          <p className="text-white/40 text-sm">
            &copy; {new Date().getFullYear()} SAMETA
          </p>
        </div>
      </footer>
    </div>
  );
}
