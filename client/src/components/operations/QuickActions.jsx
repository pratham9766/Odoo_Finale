// Dashboard shortcut tiles (new order, receive material, plan, dispatch). Tiles the role cannot use are disabled.
import { Link } from 'react-router-dom';
import Icon from '@/components/Icons';
import { useSession } from '@/context/Session';

// Each tile opens an existing screen. Work orders are not created on their own: they come from planning a
// confirmed order, so that tile opens the order list where planning starts.
const ACTIONS = [
  { to: '/app/orders/new', label: 'New order', hint: 'Book a buyer order', icon: 'plus', perms: ['orders.create'] },
  { to: '/app/receipts/new', label: 'Receive material', hint: 'Record a goods receipt', icon: 'box', perms: ['receipt.create'] },
  { to: '/app/orders', label: 'Create work order', hint: 'Plan a confirmed order', icon: 'gear', perms: ['production.plan'] },
  { to: '/app/dispatch/new', label: 'Record dispatch', hint: 'Pack and ship rolls', icon: 'truck', perms: ['dispatch.create'] },
];

export default function QuickActions() {
  const session = useSession();
  return (
    <section className="ops-card" aria-labelledby="ops-quick-title">
      <header className="ops-card-head"><h2 id="ops-quick-title">Quick actions</h2></header>
      <div className="quick-grid">
        {ACTIONS.map((a) => {
          const allowed = a.perms.some((p) => session.can(p));
          const body = (
            <>
              <span className="quick-icon"><Icon name={a.icon} size={20} /></span>
              <strong>{a.label}</strong>
              <small>{allowed ? a.hint : 'Not in your role'}</small>
            </>
          );
          return allowed
            ? <Link key={a.label} to={a.to} className={`quick-tile${a.icon === 'plus' ? ' quick-tile-primary' : ''}`}>{body}</Link>
            : <div key={a.label} className="quick-tile is-disabled" aria-disabled="true" title="Your role does not include this action">{body}</div>;
        })}
      </div>
    </section>
  );
}
