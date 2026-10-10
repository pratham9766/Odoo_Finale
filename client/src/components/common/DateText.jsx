import { formatDate, formatDateTime } from '@/lib/format';

export default function DateText({ value, withTime }) {
  if (!value) return <span style={{ color: '#536278' }}>—</span>;
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {withTime ? formatDateTime(value) : formatDate(value)}
    </span>
  );
}
