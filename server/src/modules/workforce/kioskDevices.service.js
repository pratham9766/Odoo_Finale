import { createCrud } from '../../utils/crud/index.js';
import { randomToken, sha256Hex } from '../../utils/tokens.js';

// token_hash is not in `select`, so it never reaches a response or the audit log.
const crud = createCrud({
  table: 'kiosk_devices', label: 'Kiosk device', columns: ['name', 'active'],
  select: 't.id, t.org_id, t.name, t.active, t.last_seen_at, t.created_at',
  orderBy: 't.created_at',
  inUse: 'This device has punch history and cannot be deleted. Deactivate it instead.',
});

export const kioskDevices = {
  ...crud,

  /** The plain token is returned once, here, and never stored: only its hash is (backend plan §21). */
  async create(ctx, input) {
    const token = randomToken(32);
    const device = await crud.create(ctx, input, { token_hash: sha256Hex(token) });
    return { ...device, token };
  },
};
