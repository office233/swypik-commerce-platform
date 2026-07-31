/**
 * Client pentru Swypik Chain (geth PoA, chainId 643366).
 *
 * Bridge-ul app→chain: soldul intern (subunități, 1 SWYP = 100 units) se
 * debitează idempotent în ledgerul DB, apoi trezoreria on-chain REWARDS
 * trimite SWYP nativ (18 zecimale) către adresa userului.
 *
 * Cheia trezoreriei stă DOAR pe server (env), nu în repo.
 */
import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const swypikChain = defineChain({
    id: 643366,
    name: "Swypik Chain",
    nativeCurrency: { name: "Swypik", symbol: "SWYP", decimals: 18 },
    rpcUrls: { default: { http: [process.env.SWYP_CHAIN_RPC || "http://swypik-chain-rpc:8545"] } },
    blockExplorers: { default: { name: "SwypikScan", url: "https://scan.swypik.com" } },
});

export function publicClient() {
    return createPublicClient({ chain: swypikChain, transport: http() });
}

function treasuryAccount() {
    const pk = process.env.SWYP_TREASURY_REWARDS_PK;
    if (!pk) throw new Error("SWYP_TREASURY_REWARDS_PK lipsește");
    return privateKeyToAccount(pk as `0x${string}`);
}

/**
 * Subunități interne (1 SWYP = 100) → wei on-chain (1 SWYP = 1e18).
 * Aritmetică exclusiv pe bigint: `Number(units)` ar pierde precizie peste
 * 2^53, iar supply-ul total (10^12 subunități) e în acea zonă.
 */
export function unitsToWei(units: bigint): bigint {
    return (units * 10n ** 18n) / 100n;
}

/**
 * Trimite SWYP nativ din trezoreria REWARDS către o adresă.
 * Returnează hash-ul tranzacției după includere în bloc.
 */
export async function sendFromTreasury(to: `0x${string}`, units: bigint): Promise<`0x${string}`> {
    const hash = await submitFromTreasury(to, units);
    await waitForChainReceipt(hash);
    return hash;
}

/**
 * Doar EMITE tranzacția (returnează hash-ul imediat, fără să aștepte
 * includerea). Permite apelantului să persiste hash-ul înainte de wait —
 * elimină fereastra de dublare la crash între emitere și confirmare.
 */
export async function submitFromTreasury(to: `0x${string}`, units: bigint): Promise<`0x${string}`> {
    const account = treasuryAccount();
    const wallet = createWalletClient({ account, chain: swypikChain, transport: http() });
    return wallet.sendTransaction({ to, value: unitsToWei(units) });
}

/** Așteaptă includerea în bloc (blocuri la 5s). */
export async function waitForChainReceipt(hash: `0x${string}`): Promise<void> {
    const timeout = Number(process.env.SWYP_CHAIN_RECEIPT_TIMEOUT_MS ?? 30_000);
    await publicClient().waitForTransactionReceipt({ hash, timeout });
}

/** Soldul on-chain al unei adrese, în wei. */
export async function chainBalance(address: `0x${string}`): Promise<bigint> {
    return publicClient().getBalance({ address });
}
