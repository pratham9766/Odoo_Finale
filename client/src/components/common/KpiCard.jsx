import { Skeleton, Typography } from 'antd';
import clsx from 'clsx';

const { Text } = Typography;

/**
 * KpiCard — single metric tile with colored left border
 * status: 'ok' | 'warn' | 'bad' | 'info' | 'muted'
 */
export default function KpiCard({ label, value, suffix, delta, status = 'info', icon: Icon, loading, onClick, className }) {
  return (
    <div
      className={clsx('tl-kpi-card', `status-${status}`, onClick && 'cursor-pointer', className)}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 1 }} title={{ width: '60%' }} />
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <Text style={{ fontSize: 13, color: '#536278', fontWeight: 500 }}>{label}</Text>
            {Icon && <Icon style={{ fontSize: 18, color: '#536278', opacity: 0.6, flexShrink: 0 }} />}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span style={{ fontSize: 28, fontWeight: 700, color: '#12233F', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
              {value ?? '—'}
            </span>
            {suffix && <span style={{ fontSize: 14, color: '#536278' }}>{suffix}</span>}
          </div>
          {delta != null && (
            <div style={{ fontSize: 12, marginTop: 6, color: delta >= 0 ? '#18794E' : '#B42318' }}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%{' '}
              <span style={{ color: '#536278' }}>vs last period</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
