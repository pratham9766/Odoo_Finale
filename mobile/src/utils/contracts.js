// Normalize the backend's database field names at the frontend boundary.
export function organizations(rows) {
  return rows.filter(row => row.membership_status !== 'disabled').map(row => ({ ...row, id: row.org_id ?? row.id }));
}
export function cleanPath(path) {
  const [pathname, search = ''] = path.split('?');
  const params = new URLSearchParams(search);
  for (const [key, value] of [...params]) if (value === '') params.delete(key);
  return params.size ? `${pathname}?${params}` : pathname;
}
