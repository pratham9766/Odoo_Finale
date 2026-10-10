// Everything that shapes the simulated history (backend plan §17, overall plan §20): volumes, timings, and the patterns the
// AI assistant is meant to discover. Nothing here touches a database. Change a number here, never inside the generators.

export const SIM = {
  days: 90,
  seed: 4242,
  ordersPerDay: 1.5,
  orderMetres: { min: 150, max: 600, step: 50 },
  deadlineDays: { min: 10, max: 25 },
  efficiency: 0.6,                      // share of a machine's rated capacity it really delivers
  logEveryMinutes: 120,                 // an operator logs output about every two hours
  handoffMinutes: { min: 30, max: 90 }, // between one stage and the next
  qcDelayHours: { min: 1, max: 6 },
  partialDispatchShare: 0.3,
  overrunPct: 2,                        // a stage delivers 2% more than its target
};

export const PATTERNS = {
  // quality
  baseDefect: 0.04,
  w3ColourMismatch: 0.18,               // rolls woven on W-3 come back with colour mismatch
  supplierXHoles: 0.08,                 // yarn lots from Supplier X add holes
  reworkShare: 0.6,                     // of failed rolls, the rest are rejected
  reworkPass: 0.85,
  // production
  nightOutputFactor: 0.85,              // night shift makes 15% less per hour
  wasteSpread: 0.6,                     // ± points around the planned loss
  w3WastePct: { min: 5, max: 7 },       // W-3 wastes far more than the planned 3%
  breakdownEveryDays: 21,               // about one breakdown per machine per three weeks
  breakdownHours: { min: 1, max: 6 },
  // people
  absence: 0.04, late: 0.08, lateNight: 0.15, overtime: 0.10, halfDay: 0.01, leave: 0.01,
  absentToday: 4,
  // money
  overdueBuyers: ['Tiruppur Knit Exports', 'Ludhiana Garments Co.'],
  lateFleetPrefix: 'MH04WR',            // Western Roadways: often a day late
  paymentMix: [['onTime', 0.7], ['late', 0.2], ['partial', 0.1]],
  // the state at "now"
  redRiskOrders: 3,
  qcQueueTarget: 20,
  nearReorderYarn: 'YRN-80S-K',
};

// who sells what (contact names from config.js)
export const SUPPLIERS = {
  fibre: [['Gujarat Cotton Traders', 1]],
  yarn: [['Supplier X Yarn Mills', 0.65], ['Gujarat Cotton Traders', 0.35]],
  dye: [['Dyechem Industries', 1]],
};
export const SUPPLIER_X = 'Supplier X Yarn Mills';

// buyers: how likely each is to place an order, and how it pays
export const BUYERS = {
  'Urban Threads Apparel': { weight: 0.4, pays: [['onTime', 0.75], ['late', 0.25]] },
  'Tiruppur Knit Exports': { weight: 0.35, pays: [['onTime', 0.2], ['late', 0.2], ['never', 0.6]] },
  'Ludhiana Garments Co.': { weight: 0.25, pays: [['late', 0.3], ['never', 0.7]] },
};

// the people who do each thing in the story (demo logins of seed v1)
export const ACTORS = {
  prod: 'prodmgr@everest.demo', qc: 'qc@everest.demo', dispatch: 'dispatch@everest.demo', accounts: 'accounts@everest.demo',
  hr: 'hr@everest.demo', maint: 'maint@everest.demo', gate: 'gate@everest.demo', store: 'store@everest.demo', purchase: 'purchase@everest.demo',
  sales: 'sales@everest.demo',
};

// the operator the demo logs in as drives W-3 on the morning shift
export const FIXED_OPERATORS = { 'W-3|A': 'Anil Kumar' };
