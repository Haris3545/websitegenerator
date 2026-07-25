import { createServiceRoleClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";

/** Fetches and decrypts one of an artist's saved third-party API keys (see
 * artist_secrets / saveArtistSecrets). Returns null if it's never been set,
 * or if it fails to decrypt (e.g. ARTIST_SECRETS_ENCRYPTION_KEY changed). */
export async function getArtistSecret(artistId: string, key: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("artist_secrets")
    .select("encrypted")
    .eq("artist_id", artistId)
    .maybeSingle();

  const encrypted = data?.encrypted?.[key];
  if (!encrypted) return null;

  try {
    return decryptSecret(encrypted);
  } catch {
    return null;
  }
}
