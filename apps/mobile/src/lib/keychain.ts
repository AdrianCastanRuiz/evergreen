import * as SecureStore from "expo-secure-store";

// JWT access + refresh tokens live ONLY in the platform keychain (NFR8, AD-8).
// This module is the sole owner of expo-secure-store in the app — no other
// module may import it.

const ACCESS_TOKEN_KEY = "evergreen.access_token";
const REFRESH_TOKEN_KEY = "evergreen.refresh_token";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function saveTokens(pair: TokenPair): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, pair.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, pair.refreshToken),
  ]);
}

export async function loadTokens(): Promise<TokenPair | null> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ]);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}
