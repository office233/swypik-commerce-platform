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
import { SWYP_CHAIN_ID, SWYP_CHAIN_NAME, SWYP_NATIVE_CURRENCY, SWYP_EXPLORER_URL } from "./chain-public";

export const swypikChain = defineChain({
    id: SWYP_CHAIN_ID,
    name: SWYP_CHAIN_NAME,
    nativeCurrency: { ...SWYP_NATIVE_CURRENCY },
    rpcUrls: { default: { http: [process.env.SWYP_CHAIN_RPC || "http://swypik-chain-rpc:8545"] } },
    blockExplorers: { default: { name: "SwypikScan", url: SWYP_EXPLORER_URL } },
});

export function publicClient() {
    return createPublicClient({ chain: swypikChain, transport: http() });
}

function treasuryAccount() {
    const pk = process.env.SWYP_TREASURY_REWARDS_PK;
    if (!pk) throw new Error("SWYP_TREASURY_REWARDS_PK lipsește");
    return privateKeyToAccount(pk as `0x${string}`);
}

/** Adresa trezoreriei REWARDS — folosită și ca adresă de depozit chain→app. */
export function treasuryAddress(): `0x${string}` {
    return treasuryAccount().address;
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

/**
 * Transfer P2P: semnează cu cheia privată a USERULUI (portofel custodial)
 * și trimite `wei` către `to`. Returnează hash-ul imediat după emitere
 * (apelantul persistă hash-ul, apoi așteaptă confirmarea).
 *
 * Verifică înainte că soldul acoperă suma + gas (21000 * gasPrice), ca să
 * nu ardem nonce-uri pe tranzacții sortite eșecului.
 */
export async function submitUserTransfer(
    userPk: `0x${string}`,
    to: `0x${string}`,
    wei: bigint,
): Promise<`0x${string}`> {
    const account = privateKeyToAccount(userPk);
    const pub = publicClient();
    const [balance, gasPrice] = await Promise.all([
        pub.getBalance({ address: account.address }),
        pub.getGasPrice(),
    ]);
    const gasCost = 21_000n * gasPrice;
    if (balance < wei + gasCost) {
        throw new InsufficientChainBalanceError(balance, wei + gasCost);
    }
    const wallet = createWalletClient({ account, chain: swypikChain, transport: http() });
    return wallet.sendTransaction({ to, value: wei });
}

export class InsufficientChainBalanceError extends Error {
    constructor(public balance: bigint, public required: bigint) {
        super("sold on-chain insuficient (suma + gas)");
        this.name = "InsufficientChainBalanceError";
    }
}
