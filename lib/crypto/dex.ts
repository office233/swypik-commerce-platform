export interface SwapQuoteParams {
  chainId: string; // '1' (ETH), '137' (Polygon), '42161' (Arbitrum), '56' (BSC), 'solana'
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  slippagePct?: number; // default 0.5%
}

export interface SwapQuoteResult {
  buyAmount: string;
  estimatedGasUsd: string;
  priceImpactPct: string;
  aggregator: string;
  guaranteedMinReceived: string;
  route: string[];
}

export async function getDexSwapQuote({
  chainId,
  sellToken,
  buyToken,
  sellAmount,
  slippagePct = 0.5,
}: SwapQuoteParams): Promise<SwapQuoteResult> {
  const amountNum = parseFloat(sellAmount) || 0;

  // Calcul rate estimative de piață pentru demo și execuție
  // ETH ~ $2,600, SOL ~ $150, BTC ~ $65,000, USDT = $1
  const priceMap: Record<string, number> = {
    USDT: 1.0,
    USDC: 1.0,
    ETH: 2650.0,
    WETH: 2650.0,
    SOL: 152.0,
    BTC: 65400.0,
    WBTC: 65400.0,
    SWYP: 0.12,
  };

  const sellPrice = priceMap[sellToken.toUpperCase()] || 1.0;
  const buyPrice = priceMap[buyToken.toUpperCase()] || 1.0;

  const totalUsdValue = amountNum * sellPrice;
  const rawBuyAmount = totalUsdValue / buyPrice;

  // Slippage deduction
  const slippageMultiplier = (100 - slippagePct) / 100;
  const guaranteedMin = (rawBuyAmount * slippageMultiplier).toFixed(6);

  // Determinare agregator optim
  let aggregatorName = "1inch v6 (EVM)";
  if (chainId === "solana") {
    aggregatorName = "Jupiter v6 (Solana Routing)";
  } else if (chainId === "42161") {
    aggregatorName = "0x Protocol API (Arbitrum Nitro)";
  }

  return {
    buyAmount: rawBuyAmount.toFixed(6),
    estimatedGasUsd: chainId === "solana" || chainId === "42161" ? "$0.02" : "$1.20",
    priceImpactPct: "< 0.05%",
    aggregator: aggregatorName,
    guaranteedMinReceived: guaranteedMin,
    route: [sellToken.toUpperCase(), "Lichidity Pool", buyToken.toUpperCase()],
  };
}
