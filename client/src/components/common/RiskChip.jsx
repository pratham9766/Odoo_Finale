import { Tag } from 'antd';

const RISK_CONFIG = {
  green: { color: 'success', text: 'On track',  emoji: '🟢' },
  amber: { color: 'warning', text: 'At risk',   emoji: '🟡' },
  red:   { color: 'error',   text: 'Late',       emoji: '🔴' },
};

export default function RiskChip({ risk }) {
  if (!risk) return null;
  const cfg = RISK_CONFIG[risk] ?? { color: 'default', text: risk, emoji: '⚪' };
  return (
    <Tag color={cfg.color}>
      {cfg.emoji} {cfg.text}
    </Tag>
  );
}
