// Something printable for a document header: the mill itself, or a buyer / supplier contact.

const CONTACT = `select name, gstin, address, city, null as state, null as pincode, phone, email from contacts where id = $1`;

/** @returns {Promise<{ name, gstin, address, city, state, pincode, phone, email } | null>} */
export async function loadContact(db, contactId) {
  if (!contactId) return null;
  const { rows: [party] } = await db.query(CONTACT, [contactId]);
  return party ?? null;
}

/** The mill's own details. */
export async function loadMillParty(db) {
  const { rows: [m] } = await db.query(`select name, gstin, address, city, state, pincode, phone, email, settings from mill`);
  return m ?? null;
}
