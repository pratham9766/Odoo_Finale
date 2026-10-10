// createUser() backed by the Supabase Admin API (backend plan §17). Safe to run again after a demo reset:
// users that already exist are reused and get the demo password back.

const ALREADY_EXISTS = /already (been )?registered|already exists|email_exists/i;

async function findByEmail(admin, email) {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) throw new Error(`Supabase says ${email} exists but it was not found in the user list`);
  }
}

/** @returns {Promise<({ email, fullName }) => Promise<string>>} */
export async function supabaseUserCreator({ url, serviceKey, password }) {
  const { createClient } = await import('@supabase/supabase-js');
  const { admin } = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }).auth;

  return async ({ email, fullName }) => {
    const { data, error } = await admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    });
    if (!error) return data.user.id;
    if (!ALREADY_EXISTS.test(`${error.code ?? ''} ${error.message}`)) throw error;

    const existing = await findByEmail(admin, email);
    const { error: updateError } = await admin.updateUserById(existing.id, { password, email_confirm: true });
    if (updateError) throw updateError;
    return existing.id;
  };
}
