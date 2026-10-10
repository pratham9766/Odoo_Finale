// The mill's buyers and suppliers: names on orders, GRNs and invoices. They do not log in.

import { insertRows } from '../lib/insert.js';

const COLUMNS = ['type', 'name', 'phone', 'email', 'gstin', 'address', 'city'];

export async function seedContacts(db, profile) {
  const contacts = await insertRows(db, 'contacts', profile.contacts.map((c) => Object.fromEntries(COLUMNS.map((k) => [k, c[k] ?? null]))));

  // each raw material kind has a default supplier, so a shortage on an order can draft its purchase orders by itself
  for (const [kind, name] of Object.entries(profile.preferredSuppliers)) {
    const supplier = contacts.find((c) => c.type === 'supplier' && c.name === name);
    if (!supplier) throw new Error(`Preferred supplier "${name}" (for ${kind}) is not one of the contacts`);
    await db.query('update items set preferred_supplier_contact_id = $1 where kind = $2', [supplier.id, kind]);
  }
  return contacts;
}
