// All demo data for seed v1 (backend plan §17, overall plan §20). Generators read this; nothing here touches a database.
// Two mills: Everest (the full demo) and Shakti Spinners (a small second tenant that proves isolation).
// Role names must match the roles created by server/src/modules/staff/defaultRoles.js (overall plan §9.2).

export const SEED = 42;
export const DEMO_PASSWORD = 'Demo@1234';

// ---- shared masters ----------------------------------------------------------------

// Stage losses follow the 1-shirt example (overall plan §12.2): spinning 12%, weaving 3%, dyeing 5% weight + 4% length.
const STAGES = [
  { name: 'Spinning', sequence: 1, output_kind: 'yarn', weight_loss_pct: 12, length_shrink_pct: 0 },
  { name: 'Weaving', sequence: 2, output_kind: 'grey_fabric', weight_loss_pct: 3, length_shrink_pct: 0 },
  { name: 'Dyeing', sequence: 3, output_kind: 'finished_fabric', weight_loss_pct: 5, length_shrink_pct: 4 },
];

const SHIFTS = [
  { name: 'A', start_time: '06:00', end_time: '14:00', grace_min: 10 },
  { name: 'B', start_time: '14:00', end_time: '22:00', grace_min: 10 },
  { name: 'C', start_time: '22:00', end_time: '06:00', grace_min: 10 },
];

const DEFECT_TYPES = [
  { code: 'HOLE', name: 'Hole', severity_default: 3 },
  { code: 'COLOUR', name: 'Colour mismatch', severity_default: 3 },
  { code: 'UNEVEN', name: 'Uneven weave', severity_default: 2 },
  { code: 'STAIN', name: 'Stain', severity_default: 2 },
  { code: 'BROKEN_END', name: 'Broken end', severity_default: 1 },
];

const WAREHOUSES = [
  { name: 'Raw store', kind: 'raw' },
  { name: 'WIP store', kind: 'wip' },
  { name: 'Finished goods', kind: 'finished' },
  { name: 'Scrap yard', kind: 'scrap' },
];

// ---- worker names (generated workers pick from these) ---------------------------------

export const FIRST_NAMES = [
  'Ramesh', 'Suresh', 'Mahesh', 'Dinesh', 'Rajesh', 'Anil', 'Sunil', 'Vijay', 'Sanjay', 'Prakash', 'Ganesh', 'Mohan',
  'Kishor', 'Bharat', 'Nilesh', 'Hitesh', 'Jignesh', 'Ashok', 'Manoj', 'Deepak', 'Sunita', 'Kavita', 'Geeta', 'Anita',
  'Rekha', 'Lata', 'Meena', 'Pushpa', 'Savita', 'Seema', 'Jyoti', 'Nirmala', 'Shobha', 'Usha', 'Kalpana', 'Hansa', 'Rani',
  'Bhavna', 'Sarita', 'Varsha',
];
export const LAST_NAMES = [
  'Patel', 'Shah', 'Pawar', 'Yadav', 'Sharma', 'Verma', 'Chauhan', 'Solanki', 'Parmar', 'Rathod', 'Desai', 'Gupta', 'Mishra',
  'Singh', 'Kumar', 'Jadhav', 'Shinde', 'Gaikwad', 'Mali', 'Vasava', 'Chaudhari', 'Thakor', 'Rana', 'Prajapati', 'Soni',
  'Vora', 'Tiwari', 'Dubey',
];
export const SKILLS = {
  Spinning: ['Ring frame operator', 'Doffer', 'Roving tender'],
  Weaving: ['Loom operator', 'Weaver', 'Warper', 'Beam gaiter'],
  Dyeing: ['Dyer', 'Machine helper', 'Finisher'],
};

// ---- catalog building blocks ------------------------------------------------------------

const fibres = [
  { sku: 'FIB-COT', name: 'Cotton fibre (Shankar-6)', composition: 'cotton', std_rate: 165, reorder_level: 500 },
  { sku: 'FIB-PES', name: 'Polyester staple fibre', composition: 'polyester', std_rate: 110, reorder_level: 200 },
];

const yarns = [
  { sku: 'YRN-10S-C', name: 'Cotton 10s carded', count_ne: 10, blend: { 'FIB-COT': 1 }, std_rate: 205, reorder_level: 200 },
  { sku: 'YRN-20S-C', name: 'Cotton 20s carded', count_ne: 20, blend: { 'FIB-COT': 1 }, std_rate: 235, reorder_level: 300 },
  { sku: 'YRN-24S-C', name: 'Cotton 24s carded', count_ne: 24, blend: { 'FIB-COT': 1 }, std_rate: 248, reorder_level: 200 },
  { sku: 'YRN-30S-C', name: 'Cotton 30s carded', count_ne: 30, blend: { 'FIB-COT': 1 }, std_rate: 262, reorder_level: 300 },
  { sku: 'YRN-30S-K', name: 'Cotton 30s combed', count_ne: 30, blend: { 'FIB-COT': 1 }, std_rate: 290, reorder_level: 300 },
  { sku: 'YRN-40S-C', name: 'Cotton 40s carded', count_ne: 40, blend: { 'FIB-COT': 1 }, std_rate: 295, reorder_level: 250 },
  { sku: 'YRN-40S-K', name: 'Cotton 40s combed', count_ne: 40, blend: { 'FIB-COT': 1 }, std_rate: 325, reorder_level: 400 },
  { sku: 'YRN-50S-K', name: 'Cotton 50s combed', count_ne: 50, blend: { 'FIB-COT': 1 }, std_rate: 355, reorder_level: 200 },
  { sku: 'YRN-60S-K', name: 'Cotton 60s combed', count_ne: 60, blend: { 'FIB-COT': 1 }, std_rate: 390, reorder_level: 150 },
  { sku: 'YRN-80S-K', name: 'Cotton 80s combed', count_ne: 80, blend: { 'FIB-COT': 1 }, std_rate: 470, reorder_level: 100 },
  { sku: 'YRN-30S-PC', name: 'Poly-cotton 30s (65/35)', count_ne: 30, blend: { 'FIB-COT': 0.65, 'FIB-PES': 0.35 }, std_rate: 245, reorder_level: 250 },
  { sku: 'YRN-40S-PC', name: 'Poly-cotton 40s (65/35)', count_ne: 40, blend: { 'FIB-COT': 0.65, 'FIB-PES': 0.35 }, std_rate: 268, reorder_level: 250 },
];

const dyes = [
  { sku: 'DYE-NAVY', name: 'Reactive dye Navy', colour: 'Navy blue', std_rate: 920, reorder_level: 25 },
  { sku: 'DYE-RED', name: 'Reactive dye Red', colour: 'Maroon', std_rate: 1080, reorder_level: 20 },
  { sku: 'DYE-BLACK', name: 'Reactive dye Black', colour: 'Black', std_rate: 860, reorder_level: 30 },
  { sku: 'DYE-SKY', name: 'Reactive dye Sky blue', colour: 'Sky blue', std_rate: 990, reorder_level: 15 },
  { sku: 'DYE-OLIVE', name: 'Reactive dye Olive', colour: 'Olive green', std_rate: 1040, reorder_level: 15 },
];

const scrap = [
  { sku: 'SCR-FIBRE', name: 'Cotton fibre waste', std_rate: 28 },
  { sku: 'SCR-YARN', name: 'Yarn waste', std_rate: 45 },
  { sku: 'SCR-FABRIC', name: 'Fabric cuttings', std_rate: 35 },
];

// one quality = grey fabric + finished fabric + the two BOMs between yarn and finished cloth (see recipes.js)
const qualities = [
  { code: 'POP', name: 'Poplin', gsm: 120, width_in: 58, warp: 'YRN-40S-K', weft: 'YRN-40S-K', warp_pct: 55, colour: 'Navy blue', dye: 'DYE-NAVY', shade_pct: 2, roll_length_m: 50, grey_rate: 92, finished_rate: 138 },
  { code: 'TWL', name: 'Twill', gsm: 160, width_in: 58, warp: 'YRN-30S-K', weft: 'YRN-30S-C', warp_pct: 55, colour: 'Black', dye: 'DYE-BLACK', shade_pct: 3, roll_length_m: 50, grey_rate: 118, finished_rate: 172 },
  { code: 'CVS', name: 'Canvas', gsm: 220, width_in: 60, warp: 'YRN-20S-C', weft: 'YRN-10S-C', warp_pct: 50, colour: 'Olive green', dye: 'DYE-OLIVE', shade_pct: 3, roll_length_m: 40, grey_rate: 142, finished_rate: 205 },
  { code: 'VOL', name: 'Voile', gsm: 80, width_in: 58, warp: 'YRN-60S-K', weft: 'YRN-80S-K', warp_pct: 52, colour: 'Sky blue', dye: 'DYE-SKY', shade_pct: 1.5, roll_length_m: 60, grey_rate: 96, finished_rate: 148 },
  { code: 'SAT', name: 'Sateen', gsm: 140, width_in: 58, warp: 'YRN-50S-K', weft: 'YRN-40S-K', warp_pct: 58, colour: 'Maroon', dye: 'DYE-RED', shade_pct: 3, roll_length_m: 50, grey_rate: 126, finished_rate: 186 },
  { code: 'OXF', name: 'Oxford', gsm: 135, width_in: 58, warp: 'YRN-30S-C', weft: 'YRN-40S-C', warp_pct: 55, colour: 'Sky blue', dye: 'DYE-SKY', shade_pct: 1.5, roll_length_m: 50, grey_rate: 104, finished_rate: 154 },
  { code: 'PCP', name: 'Poly-cotton poplin', gsm: 110, width_in: 58, warp: 'YRN-40S-PC', weft: 'YRN-40S-PC', warp_pct: 55, colour: 'Black', dye: 'DYE-BLACK', shade_pct: 2.5, roll_length_m: 50, grey_rate: 78, finished_rate: 119 },
  { code: 'DRL', name: 'Drill', gsm: 190, width_in: 58, warp: 'YRN-24S-C', weft: 'YRN-20S-C', warp_pct: 55, colour: 'Olive green', dye: 'DYE-OLIVE', shade_pct: 3, roll_length_m: 40, grey_rate: 128, finished_rate: 188 },
];

// ---- the two mills -------------------------------------------------------------------------

export const PROFILES = {
  everest: {
    org: {
      name: 'Everest Textile Mills', types: ['manufacturer'], gstin: '24AAACE4567F1Z2',
      address: 'Plot 112, Sachin GIDC', city: 'Surat', state: 'Gujarat', pincode: '394230',
      phone: '+91 261 240 1100', email: 'accounts@everest.demo',
      settings: { timezone: 'Asia/Kolkata', currency: 'INR', invoice_prefix: 'EVT' },
    },
    stages: STAGES, shifts: SHIFTS, defectTypes: DEFECT_TYPES, warehouses: WAREHOUSES,
    machines: [
      { prefix: 'S', count: 6, stage: 'Spinning', label: 'Ring frame', capacity: 40, uom: 'kg', overhead: 150 },
      { prefix: 'W', count: 8, stage: 'Weaving', label: 'Air-jet loom', capacity: 55, uom: 'm', overhead: 220 },
      { prefix: 'D', count: 6, stage: 'Dyeing', label: 'Jet dyeing machine', capacity: 120, uom: 'm', overhead: 260 },
    ],
    kioskDevices: ['Main gate tablet'],
    workers: {
      perStage: { Spinning: 18, Weaving: 26, Dyeing: 16 },       // 60 in total, named workers included
      wageMix: [['daily', 0.6], ['hourly', 0.25], ['piece', 0.15]],
      contractShare: 0.25,
      // also a login: op.w3@ is this worker (users.worker below)
      named: [{ name: 'Anil Kumar', stage: 'Weaving', shift: 'A', wage_type: 'daily', rate: 650, skill: 'Loom operator' }],
    },
    catalog: {
      fibres, yarns, dyes, scrap, qualities,
      garments: [{ sku: 'GAR-SHIRT', name: "Men's formal shirt", std_rate: 480, quality: 'POP', fabric_m: 1.6, cutting_waste_pct: 10 }],
    },
    contacts: [
      { type: 'buyer', name: 'Urban Threads Apparel', city: 'Surat', phone: '+91 98250 11001', email: 'purchase@urbanthreads.demo', gstin: '24AABCU9603R1ZM', address: '45 Ring Road' },
      { type: 'buyer', name: 'Tiruppur Knit Exports', city: 'Tiruppur', phone: '+91 98430 22002', email: 'orders@tiruppurknit.demo', gstin: '33AAACT2211K1Z8', address: '12 Kangeyam Road' },
      { type: 'buyer', name: 'Ludhiana Garments Co.', city: 'Ludhiana', phone: '+91 98140 33003', email: 'buy@ludhianagarments.demo', gstin: '03AAACL7788Q1Z4', address: '8 Focal Point' },
      { type: 'supplier', name: 'Gujarat Cotton Traders', city: 'Rajkot', phone: '+91 98240 44004', email: 'sales@gujcotton.demo', gstin: '24AAACG3344M1Z6', address: 'APMC Yard' },
      { type: 'supplier', name: 'Supplier X Yarn Mills', city: 'Coimbatore', phone: '+91 98940 55005', email: 'dispatch@supplierx.demo', gstin: '33AAACS5566N1Z2', address: '77 Avinashi Road' },
      { type: 'supplier', name: 'Dyechem Industries', city: 'Ahmedabad', phone: '+91 98790 66006', email: 'orders@dyechem.demo', gstin: '24AAACD6677P1Z9', address: 'Naroda GIDC' },
      { type: 'transporter', name: 'Speedline Logistics', city: 'Surat', phone: '+91 98250 77007', email: 'ops@speedline.demo', gstin: '24AAACS7788L1Z1', address: 'Kamrej Transport Nagar' },
      { type: 'transporter', name: 'Western Roadways', city: 'Mumbai', phone: '+91 98200 88008', email: 'ops@westernroadways.demo', gstin: '27AAACW8899R1Z3', address: 'Bhiwandi Godown 14' },
    ],
    // scope names are resolved to ids; empty / missing scope = whole org
    users: [
      { email: 'owner@everest.demo', name: 'Ravi Mehta', role: 'Owner' },
      { email: 'gm@everest.demo', name: 'Kiran Desai', role: 'General Manager' },
      { email: 'prodmgr@everest.demo', name: 'Anand Joshi', role: 'Production Manager' },
      { email: 'sup.weaving@everest.demo', name: 'Mahesh Patil', role: 'Shift Supervisor', scope: { stages: ['Weaving'], shifts: ['A'] } },
      { email: 'op.w3@everest.demo', name: 'Anil Kumar', role: 'Machine Operator', scope: { machines: ['W-3'] }, worker: 'Anil Kumar' },
      { email: 'qchead@everest.demo', name: 'Pooja Nair', role: 'QC Head' },
      { email: 'qc@everest.demo', name: 'Imran Sheikh', role: 'QC Inspector' },
      { email: 'store@everest.demo', name: 'Dilip Rathod', role: 'Store Keeper', scope: { warehouses: ['Raw store'] } },
      { email: 'dispatch@everest.demo', name: 'Nitin Gaikwad', role: 'Dispatch In-charge', scope: { warehouses: ['Finished goods'] } },
      { email: 'purchase@everest.demo', name: 'Hetal Shah', role: 'Purchase Officer' },
      { email: 'sales@everest.demo', name: 'Rohit Agarwal', role: 'Sales Coordinator' },
      { email: 'accounts@everest.demo', name: 'Sneha Kulkarni', role: 'Accountant' },
      { email: 'hr@everest.demo', name: 'Meera Iyer', role: 'HR Clerk' },
      { email: 'maint@everest.demo', name: 'Santosh Jadhav', role: 'Maintenance Technician' },
      { email: 'gate@everest.demo', name: 'Bhola Singh', role: 'Gate Security' },
    ],
  },

  // a spinner: same machine codes (S-1…) and yarn SKUs as Everest, so isolation tests have something to prove
  shakti: {
    org: {
      name: 'Shakti Spinners', types: ['manufacturer'], gstin: '33AAACS1234F1Z7',
      address: '9 Mettupalayam Road', city: 'Coimbatore', state: 'Tamil Nadu', pincode: '641043',
      phone: '+91 422 255 0900', email: 'info@shakti.demo',
      settings: { timezone: 'Asia/Kolkata', currency: 'INR', invoice_prefix: 'SHK' },
    },
    stages: STAGES.slice(0, 1), shifts: SHIFTS.slice(0, 2), defectTypes: DEFECT_TYPES.slice(0, 3), warehouses: WAREHOUSES,
    machines: [{ prefix: 'S', count: 5, stage: 'Spinning', label: 'Ring frame', capacity: 36, uom: 'kg', overhead: 140 }],
    kioskDevices: ['Gate tablet'],
    workers: { perStage: { Spinning: 12 }, wageMix: [['daily', 0.7], ['hourly', 0.3]], contractShare: 0.2, named: [] },
    catalog: {
      fibres: fibres.slice(0, 1),
      yarns: yarns.filter((y) => ['YRN-20S-C', 'YRN-30S-C', 'YRN-40S-C'].includes(y.sku)),
      dyes: [], scrap: scrap.slice(0, 1), qualities: [], garments: [],
    },
    contacts: [
      { type: 'buyer', name: 'Southern Hosiery Mills', city: 'Tiruppur', phone: '+91 98430 99001', email: 'buy@southernhosiery.demo', gstin: '33AAACS9900H1Z5', address: '3 Palladam Road' },
      { type: 'supplier', name: 'Salem Cotton Traders', city: 'Salem', phone: '+91 98420 99002', email: 'sales@salemcotton.demo', gstin: '33AAACS8800T1Z3', address: 'Cotton Market' },
    ],
    users: [{ email: 'owner@shakti.demo', name: 'Lakshmi Narayan', role: 'Owner' }],
  },
};
