import { insertRows } from '../lib/insert.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I: codes get read out over the phone

/** Insert the organization. connect_code = first 3 letters of the name + '-' + 4 random characters (backend plan §11.1). */
export async function seedOrganization(db, org, rng) {
  const [row] = await insertRows(db, 'organizations', [{
    name: org.name,
    types: org.types,
    gstin: org.gstin, address: org.address, city: org.city, state: org.state, pincode: org.pincode,
    phone: org.phone, email: org.email,
    connect_code: `${org.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}-${rng.token(4, CODE_ALPHABET)}`,
    settings: JSON.stringify(org.settings),
  }]);
  return row;
}
