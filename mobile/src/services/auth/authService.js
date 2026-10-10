import { supabase } from '../../lib/supabase';

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signup(email, password, name) {
  // Not allowed in hackathon MVP as per prompt
  throw new Error("Signup is not supported in this version. Use provisioned credentials.");
}

export async function recoverPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
