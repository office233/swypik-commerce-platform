/**
 * Client pentru Swypik Chain (geth PoA, chainId 643366).
 *
 * Bridge-ul app→chain: soldul intern (subunități, 1 SWYP = 100 units) se
 * debitează idempotent în ledgerul DB, apoi trezoreria on-chain REWARDS
 * trimite SWYP nativ (18 zecimale) către adresa userului.
 *
 * Cheia trezoreriei stă DOAR pe server (env), nu în repo.
 */
import { createPublicClient, createWalletClient, http, defineChain, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const swypikChain = defineChain({
    id: 643366,
    name: "Swypik Chain",
    nativeCurrency: { name: "Swypik", symbol: "SWYP", decimals: 18 },
    rpcUrls: { default: { http: [process.env.SWYP_CHAIN_RPC || "http://172.17.0.1:8545"] } },
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

/** Subunități interne (1 SWYP = 100) → wei on-chain (1 SWYP = 1e18). */
export function unitsToWei(units: bigint): bigint {
    return parseUnits((Number(units) / 100).toString(), 18);
}

/**
 * Trimite SWYP nativ din trezoreria REWARDS către o adresă.
 * Returnează hash-ul tranzacției după includere în bloc.
 */
export async function sendFromTreasury(to: `0x${string}`, units: bigint): Promise<`0x${string}`> {
    const account = treasuryAccount();
    const wallet = createWalletClient({ account, chain: swypikChain, transport: http() });
    const hash = await wallet.sendTransaction({ to, value: unitsToWei(units) });
    // așteptăm includerea (blocuri la 5s) ca să putem afișa link de explorer valid
    await publicClient().waitForTransactionReceipt({ hash, timeout: 30_000 });
    return hash;
}

/** Soldul on-chain al unei adrese, în wei. */
export async function chainBalance(address: `0x${string}`): Promise<bigint> {
    return publicClient().getBalance({ address });
}
