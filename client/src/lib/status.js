// Single source of truth for status → color/label
export const STATUS = {
  // Generic
  draft:        { color: 'default',    label: 'Draft' },
  active:       { color: 'success',    label: 'Active' },
  inactive:     { color: 'default',    label: 'Inactive' },
  pending:      { color: 'warning',    label: 'Pending' },
  suspended:    { color: 'error',      label: 'Suspended' },

  // Orders
  confirmed:            { color: 'blue',       label: 'Confirmed' },
  waiting_material:     { color: 'orange',     label: 'Waiting material' },
  material_ready:       { color: 'cyan',       label: 'Material ready' },
  in_production:        { color: 'processing', label: 'In production' },
  in_qc:                { color: 'geekblue',   label: 'In QC' },
  ready_to_ship:        { color: 'green',      label: 'Ready to ship' },
  partially_dispatched: { color: 'gold',       label: 'Partly dispatched' },
  dispatched:           { color: 'purple',     label: 'Dispatched' },
  delivered:            { color: 'success',    label: 'Delivered' },
  cancelled:            { color: 'default',    label: 'Cancelled' },
  closed:               { color: 'default',    label: 'Closed' },

  // Machines
  running:     { color: 'success', label: 'Running' },
  idle:        { color: 'warning', label: 'Idle' },
  breakdown:   { color: 'error',   label: 'Breakdown' },
  maintenance: { color: 'default', label: 'Maintenance' },

  // Work orders
  planned:  { color: 'default',    label: 'Planned' },
  paused:   { color: 'warning',    label: 'Paused' },
  done:     { color: 'success',    label: 'Done' },

  // Rolls / QC
  produced:    { color: 'default',    label: 'Produced' },
  pending_qc:  { color: 'warning',    label: 'Waiting QC' },
  passed:      { color: 'success',    label: 'Passed' },
  rework:      { color: 'processing', label: 'Rework' },
  rejected:    { color: 'error',      label: 'Rejected' },
  packed:      { color: 'cyan',       label: 'Packed' },

  // Attendance
  present:      { color: 'success', label: 'Present' },
  late:         { color: 'warning', label: 'Late' },
  half_day:     { color: 'gold',    label: 'Half day' },
  absent:       { color: 'error',   label: 'Absent' },
  leave:        { color: 'default', label: 'Leave' },
  weekly_off:   { color: 'default', label: 'Weekly off' },
  holiday:      { color: 'default', label: 'Holiday' },

  // Trips / Dispatch
  packing:    { color: 'default',    label: 'Packing' },
  requested:  { color: 'default',    label: 'Requested' },
  assigned:   { color: 'blue',       label: 'Assigned' },
  picked_up:  { color: 'cyan',       label: 'Picked up' },
  in_transit: { color: 'processing', label: 'In transit' },
  reached:    { color: 'geekblue',   label: 'Reached' },
  disputed:   { color: 'error',      label: 'Disputed' },
  rejected:   { color: 'error',      label: 'Rejected' },

  // Purchase orders
  sent:               { color: 'blue',    label: 'Sent' },
  accepted:           { color: 'green',   label: 'Accepted' },
  partially_accepted: { color: 'gold',    label: 'Partly accepted' },

  // Invoices / Finance
  unpaid:  { color: 'warning', label: 'Unpaid' },
  partial: { color: 'gold',    label: 'Partly paid' },
  paid:    { color: 'success', label: 'Paid' },
  overdue: { color: 'error',   label: 'Overdue' },

  // Risk
  green: { color: 'success', label: 'On track' },
  amber: { color: 'warning', label: 'At risk' },
  red:   { color: 'error',   label: 'Late' },

  // Partnerships
  blocked:  { color: 'error',   label: 'Blocked' },

  // Tickets
  open:        { color: 'error',   label: 'Open' },
  in_progress: { color: 'warning', label: 'In progress' },
  resolved:    { color: 'success', label: 'Resolved' },

  // Wage runs
  approved: { color: 'success', label: 'Approved' },
};

export const statusOf = (key) => STATUS[key] ?? { color: 'default', label: key ?? '—' };
