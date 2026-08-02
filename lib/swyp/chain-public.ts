/**
 * Parametri PUBLICI ai Swypik Chain — unica sursă de adevăr pentru
 * client (MetaMask add-chain) ȘI server (lib/swyp/chain.ts).
 * NU pune nimic secret aici (fișierul ajunge în bundle-ul client).
 */
export const SWYP_CHAIN_ID = 643366;
export const SWYP_CHAIN_ID_HEX = `0x${SWYP_CHAIN_ID.toString(16).toUpperCase()}`; // 0x9D126
export const SWYP_CHAIN_NAME = "Swypik Chain";
export const SWYP_NATIVE_CURRENCY = { name: "Swypik", symbol: "SWYP", decimals: 18 } as const;
/** RPC public (browser/MetaMask). Serverul folosește SWYP_CHAIN_RPC (rețea internă). */
export const SWYP_PUBLIC_RPC_URL =
    process.env.NEXT_PUBLIC_SWYP_CHAIN_RPC || "https://rpc.swypik.com";
export const SWYP_EXPLORER_URL =
    process.env.NEXT_PUBLIC_SWYP_EXPLORER_URL || "https://scan.swypik.com";
