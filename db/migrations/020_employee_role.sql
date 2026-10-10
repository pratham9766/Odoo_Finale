-- 020: the Employee role (rank 10). It has no permissions on purpose: an employee sees only their own My work page
-- (GET /me/work: today's machine, attendance, output, payslips) and their profile. Same as defaultRoles.js.
insert into roles (name, rank)
select 'Employee', 10
where not exists (select 1 from roles where lower(name) = 'employee');
