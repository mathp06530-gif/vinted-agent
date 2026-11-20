// Stockage en ligne (Supabase) : annonces, photos, réglages. Synchronisé sur tous tes appareils.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "../config.js?v=10";

export const configured = Boolean(SUPABASE_URL && SUPABASE_KEY);
export const sb = configured ? createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
}) : null;
const BUCKET = "photos";

const fail = (error, msg) => { if (error) throw new Error(msg ? `${msg} (${error.message})` : error.message); };

// ---------- compte ----------
export async function currentUser() {
  const { data } = await sb.auth.getSession();
  return data.session?.user || null;
}
export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message.includes("Invalid") ? "Email ou mot de passe incorrect." : error.message);
}
export async function signUp(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password });
  fail(error);
  return Boolean(data.session); // false = il faut confirmer l'email
}
export const signOut = () => sb.auth.signOut();

// ---------- annonces ----------
export async function listListings() {
  const { data, error } = await sb.from("listings").select("*").order("updated_at", { ascending: false });
  fail(error, "Impossible de charger les annonces");
  return data;
}
export async function getListing(id) {
  const { data, error } = await sb.from("listings").select("*").eq("id", id).single();
  fail(error);
  return data;
}
export async function createListing(fields) {
  const { data, error } = await sb.from("listings").insert(fields).select().single();
  fail(error, "Création impossible");
  return data;
}
export async function updateListing(id, fields) {
  const patch = { ...fields, updated_at: new Date().toISOString() };
  if (fields.status === "publiee") patch.published_at = patch.updated_at;
  if (fields.status === "vendue") patch.sold_at = patch.updated_at;
  const { data, error } = await sb.from("listings").update(patch).eq("id", id).select().single();
  fail(error, "Enregistrement impossible");
  return data;
}
export async function deleteListing(listing) {
  if (listing.photos?.length) await sb.storage.from(BUCKET).remove(listing.photos);
  const { error } = await sb.from("listings").delete().eq("id", listing.id);
  fail(error);
}

// ---------- photos ----------
export async function uploadPhoto(blob) {
  const user = await currentUser();
  const path = `${user.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  fail(error, "Envoi de la photo impossible");
  return path;
}
export async function removePhoto(path) {
  await sb.storage.from(BUCKET).remove([path]);
}
const urlCache = new Map(); // chemin -> { url, exp }
export async function photoUrls(paths) {
  const now = Date.now();
  const missing = paths.filter((p) => !(urlCache.get(p)?.exp > now));
  if (missing.length) {
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(missing, 3600);
    fail(error);
    data.forEach((d) => d.signedUrl && urlCache.set(d.path, { url: d.signedUrl, exp: now + 3500_000 }));
  }
  return Object.fromEntries(paths.map((p) => [p, urlCache.get(p)?.url || ""]));
}
export async function downloadPhoto(path) {
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  fail(error, "Lecture de la photo impossible");
  return data; // Blob
}

// ---------- réglages ----------
export async function loadSettings() {
  const { data, error } = await sb.from("settings").select("data").maybeSingle();
  fail(error);
  return data?.data || {};
}
export async function saveSettings(values) {
  const user = await currentUser();
  const { error } = await sb.from("settings").upsert({ user_id: user.id, data: values });
  fail(error, "Réglages non enregistrés");
}
