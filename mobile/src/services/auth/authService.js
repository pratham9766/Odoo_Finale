import { supabase } from '../../lib/supabase';

const client = () => {
  if (!supabase) throw new Error('The app is missing its Supabase settings. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to mobile/.env and restart Expo.');
  return supabase;
};

export async function login(email, password) {
  const { data, error } = await client().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signup(email, password, name) {
  // Not allowed in hackathon MVP as per prompt
  throw new Error("Signup is not supported in this version. Use provisioned credentials.");
}

export async function recoverPassword(email) {
  const { error } = await client().auth.resetPasswordForEmail(email);
  if (error) throw error;
}

export async function logout() {
  const { error } = await client().auth.signOut();
  if (error) throw error;
}
