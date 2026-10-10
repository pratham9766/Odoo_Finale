// Small helpers at the frontend boundary.
export function cleanPath(path) {
  const [pathname, search = ''] = path.split('?');
  const params = new URLSearchParams(search);
  for (const [key, value] of [...params]) if (value === '') params.delete(key);
  return params.size ? `${pathname}?${params}` : pathname;
}
