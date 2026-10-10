// A buyer, receiver or seller as something printable: a connected org's details, or an offline contact's.

const ORG = `select name, gstin, address, city, state, pincode, phone, email from organizations where id = $1`;
const CONTACT = `select name, gstin, address, city, null as state, null as pincode, phone, email from contacts where id = $1`;

/** @returns {Promise<{ name, gstin, address, city, state, pincode, phone, email } | null>} */
export async function loadParty(db, { orgId, contactId }) {
  const id = orgId ?? contactId;
  if (!id) return null;
  const { rows: [party] } = await db.query(orgId ? ORG : CONTACT, [id]);
  return party ?? null;
}
