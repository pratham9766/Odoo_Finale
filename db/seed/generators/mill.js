// Seed step: inserts the mill's own details (the single row of the mill table).
import { insertRows } from '../lib/insert.js';

/** Insert the mill's own details: the one row of the `mill` table. */
export async function seedMill(db, mill) {
  const [row] = await insertRows(db, 'mill', [{
    name: mill.name,
    gstin: mill.gstin, address: mill.address, city: mill.city, state: mill.state, pincode: mill.pincode,
    phone: mill.phone, email: mill.email,
    settings: JSON.stringify(mill.settings),
  }]);
  return row;
}
