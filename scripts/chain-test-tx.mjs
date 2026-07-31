// Prima tranzacție reală pe Swypik Chain: 1 SWYP din T_REWARDS către VALIDATOR
// (validatorul are nevoie oricum de gas). Rulat în containerul web (are viem + env).
import { createWalletClient, createPublicClient, http, defineChain, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const chain = defineChain({
    id: 643366,
    name: "Swypik Chain",
    nativeCurrency: { name: "Swypik", symbol: "SWYP", decimals: 18 },
    rpcUrls: { default: { http: [process.env.SWYP_CHAIN_RPC] } },
});

const account = privateKeyToAccount(process.env.SWYP_TREASURY_REWARDS_PK);
const wallet = createWalletClient({ account, chain, transport: http() });
const pub = createPublicClient({ chain, transport: http() });

const to = "0xA7c193ED5FFdDF9FcF473c5b292bAfb36b352ec2"; // VALIDATOR
console.log("From (T_REWARDS):", account.address);

const hash = await wallet.sendTransaction({ to, value: parseEther("1") });
console.log("TX hash:", hash);

const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 30_000 });
console.log("Status:", receipt.status, "| Block:", receipt.blockNumber.toString(), "| Gas:", receipt.gasUsed.toString());

const bal = await pub.getBalance({ address: to });
console.log("Sold VALIDATOR:", Number(bal) / 1e18, "SWYP");
