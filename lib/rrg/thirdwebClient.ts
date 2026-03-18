/**
 * Thirdweb v5 client configuration.
 *
 * Used for in-app wallet creation (email/social login) on the creator
 * registration page. This gives non-crypto-native users a wallet without
 * requiring MetaMask or any browser extension.
 *
 * Requires NEXT_PUBLIC_THIRDWEB_CLIENT_ID env var from https://thirdweb.com/dashboard
 */

import { createThirdwebClient } from 'thirdweb';

const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID ?? '';

if (!clientId && typeof window !== 'undefined') {
  console.warn('[thirdweb] NEXT_PUBLIC_THIRDWEB_CLIENT_ID not set — wallet features will not work');
}

export const thirdwebClient = createThirdwebClient({ clientId });
