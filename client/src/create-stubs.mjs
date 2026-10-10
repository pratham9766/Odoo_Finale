import { mkdirSync, writeFileSync } from 'fs';
import { dirname, basename } from 'path';

const pages = [
  'src/features/orders/pages/OrderDetailPage.jsx',
  'src/features/orders/pages/OrderCreatePage.jsx',
  'src/features/inventory/pages/StockPage.jsx',
  'src/features/inventory/pages/ReceiptsPage.jsx',
  'src/features/inventory/pages/NewReceiptPage.jsx',
  'src/features/production/pages/MachineBoardPage.jsx',
  'src/features/production/pages/WorkOrdersPage.jsx',
  'src/features/production/pages/PlanningPage.jsx',
  'src/features/production/pages/AssignmentsPage.jsx',
  'src/features/production/pages/MachinesPage.jsx',
  'src/features/quality/pages/QualityPage.jsx',
  'src/features/quality/pages/RollTracePage.jsx',
  'src/features/dispatch/pages/DispatchListPage.jsx',
  'src/features/dispatch/pages/NewDispatchPage.jsx',
  'src/features/dispatch/pages/DispatchScanPage.jsx',
  'src/features/workforce/pages/AttendanceTodayPage.jsx',
  'src/features/workforce/pages/WorkersPage.jsx',
  'src/features/workforce/pages/WagesPage.jsx',
  'src/features/finance/pages/InvoicesPage.jsx',
  'src/features/finance/pages/PaymentsPage.jsx',
  'src/features/finance/pages/BillsPage.jsx',
  'src/features/reports/pages/OrderCostPage.jsx',
  'src/features/maintenance/pages/MaintenancePage.jsx',
  'src/features/floor/pages/FloorMachinePage.jsx',
  'src/features/floor/pages/FloorSuperPage.jsx',
  'src/features/floor/pages/FloorQCPage.jsx',
  'src/features/floor/pages/FloorDispatchPage.jsx',
  'src/features/buyer/pages/BuyerOrdersPage.jsx',
  'src/features/buyer/pages/BuyerOrderDetail.jsx',
  'src/features/onboarding/pages/OnboardingWizard.jsx',
  'src/test/setup.js',
];

for (const p of pages) {
  mkdirSync(dirname(p), { recursive: true });
  const name = basename(p, '.jsx').replace('.js', '');
  let content;
  if (p.endsWith('setup.js')) {
    content = `import '@testing-library/jest-dom';\n`;
  } else {
    content = `export default function ${name}() {
  return (
    <div style={{padding:24}}>
      <h2 style={{color:'#12233F',fontSize:22,fontWeight:700}}>${name}</h2>
      <p style={{color:'#536278'}}>Implementation in progress — Phase 2+.</p>
    </div>
  );
}\n`;
  }
  writeFileSync(p, content, 'utf8');
}

console.log(`Created ${pages.length} stub files.`);
