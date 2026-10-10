import { formatQty } from '@/lib/format';

export default function QtyText({ value, uom }) {
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {formatQty(value, uom)}
    </span>
  );
}
