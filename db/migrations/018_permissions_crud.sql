-- 018: permissions become view / create / update / delete per module, plus the workflow steps that are not plain CRUD
-- (confirm, approve, post, pay, inspect ...). Replaces the list from 016. The Owner role is given every permission again;
-- any other role must be re-ticked in Settings -> Roles & permissions (there are none yet).
delete from role_permissions;
delete from permissions;

insert into permissions (key, domain, description, confidential) values
 -- staff and roles
 ('staff.view','staff','View staff',false),
 ('staff.create','staff','Invite staff',false),
 ('staff.update','staff','Change a person''s role, scope, status or linked worker',false),
 ('staff.delete','staff','Cancel pending invites',false),
 ('roles.view','staff','View roles and permissions',false),
 ('roles.create','staff','Create roles',false),
 ('roles.update','staff','Edit roles and their permissions',false),
 ('roles.delete','staff','Delete roles',false),
 -- mill settings (stages, shifts, defect types, warehouses, mill profile). Reading them is open to every staff member.
 ('settings.create','settings','Add stages, shifts, defect types and warehouses',false),
 ('settings.update','settings','Edit mill profile, stages, shifts, defect types and warehouses',false),
 ('settings.delete','settings','Delete stages, shifts, defect types and warehouses',false),
 -- buyers and suppliers
 ('contacts.view','contacts','View buyers and suppliers',false),
 ('contacts.create','contacts','Add buyers and suppliers',false),
 ('contacts.update','contacts','Edit buyers and suppliers',false),
 ('contacts.delete','contacts','Delete buyers and suppliers',false),
 -- items and BOMs
 ('items.view','catalog','View items',false),
 ('items.create','catalog','Add items',false),
 ('items.update','catalog','Edit items',false),
 ('items.delete','catalog','Deactivate items',false),
 ('bom.view','catalog','View BOMs and use the material calculator',false),
 ('bom.create','catalog','Create BOMs',false),
 ('bom.update','catalog','Edit BOMs',false),
 ('bom.delete','catalog','Delete BOMs',false),
 -- stock and goods receipts
 ('stock.view','inventory','View stock',false),
 ('stock.adjust','inventory','Request stock adjustments',false),
 ('stock.adjust_approve','inventory','Approve or reject stock adjustments',false),
 ('receipt.view','inventory','View goods receipts (GRN)',false),
 ('receipt.create','inventory','Create goods receipts (GRN)',false),
 ('receipt.post','inventory','Post a goods receipt into stock',false),
 ('receipt.delete','inventory','Cancel goods receipts',false),
 -- purchase orders
 ('po.view','procurement','View purchase orders',false),
 ('po.create','procurement','Create purchase orders',false),
 ('po.update','procurement','Send purchase orders and record supplier replies',false),
 ('po.delete','procurement','Cancel purchase orders',false),
 ('po.approve','procurement','Approve purchase orders',false),
 -- orders
 ('orders.view','orders','View orders',false),
 ('orders.create','orders','Create and plan orders',false),
 ('orders.confirm','orders','Confirm orders and reserve material',false),
 ('orders.cancel','orders','Cancel orders',false),
 ('orders.view_price','orders','See prices and amounts',true),
 -- production floor
 ('production.view','production','View the machine board and work orders',false),
 ('production.plan','production','Plan and edit work orders',false),
 ('production.log','production','Log production and create rolls',false),
 ('machine.status','production','Change machine status',false),
 ('machines.view','production','View machines',false),
 ('machines.create','production','Add machines',false),
 ('machines.update','production','Edit machines',false),
 ('machines.delete','production','Delete machines',false),
 ('assignment.view','production','View worker-to-machine assignments',false),
 ('assignment.create','production','Assign workers to machines',false),
 ('assignment.update','production','Change assignments',false),
 ('assignment.delete','production','Remove assignments',false),
 -- maintenance
 ('breakdown.report','maintenance','Report breakdowns',false),
 ('breakdown.close','maintenance','Close breakdowns',false),
 ('maintenance.fix','maintenance','Fix breakdowns',false),
 -- quality
 ('qc.view','quality','View QC and roll traceability',false),
 ('qc.inspect','quality','Inspect rolls',false),
 ('qc.override','quality','Override QC results',false),
 -- dispatch
 ('dispatch.view','dispatch','View dispatches',false),
 ('dispatch.create','dispatch','Create dispatches and scan rolls',false),
 ('dispatch.confirm','dispatch','Confirm dispatches (creates the invoice)',false),
 -- money
 ('invoice.view','finance','View invoices',true),
 ('invoice.create','finance','Create invoices',true),
 ('payment.view','finance','View payments',true),
 ('payment.create','finance','Record payments',true),
 ('expense.view','finance','View expenses and supplier bills',true),
 ('expense.create','finance','Add expenses and supplier bills',true),
 ('expense.update','finance','Edit expenses and supplier bills',true),
 ('expense.delete','finance','Delete expenses and supplier bills',true),
 -- workforce
 ('workers.view','workforce','View workers',false),
 ('workers.create','workforce','Add workers',false),
 ('workers.update','workforce','Edit workers',false),
 ('workers.delete','workforce','Delete workers',false),
 ('attendance.view','workforce','View attendance',false),
 ('attendance.mark','workforce','Mark attendance',false),
 ('attendance.approve','workforce','Approve overtime',false),
 ('wages.view','workforce','View wages',true),
 ('wages.run','workforce','Prepare wage runs',true),
 ('wages.pay','workforce','Approve and pay wages',true),
 -- reports
 ('reports.production','reports','Production reports',false),
 ('reports.qc','reports','QC reports',false),
 ('reports.attendance','reports','Attendance reports',false),
 ('reports.cost','reports','Cost per order',true),
 ('reports.pnl','reports','Monthly P&L',true);

-- the Owner (rank 100) always has every permission
insert into role_permissions (role_id, permission_key)
select r.id, p.key from roles r cross join permissions p where r.rank = 100;
