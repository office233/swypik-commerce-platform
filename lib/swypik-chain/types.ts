// Typed contracts shared with the Python swypik-chain service.
// Keep in sync with services/swypik-chain/app/api/*.

export type SwypikBalance = {
  address: string;
  balance: string;
  locked_stake: string;
  locked_presale: string;
  total_received: string;
  total_sent: string;
  total_mined: string;
};

export type SwypikTx = {
  txid: string;
  block_height: number | null;
  from: string | null;
  to: string;
  amount: string;
  fee: string;
  type: string;
  memo: string | null;
  created_at: string;
  direction: "in" | "out";
};

export type SwypikTxPage = {
  items: SwypikTx[];
  next_cursor: string | null;
};

export type SwypikMultiplier = {
  base: string;
  streak_pct: string;
  kyc_pct: string;
  pioneer_pct: string;
  circle_pct: string;
  refs_l1_pct: string;
  refs_l2_pct: string;
  refs_l3_pct: string;
  stake_pct: string;
  total_multiplier: string;
};

export type SwypikStats = {
  total_mined: string;
  streak_current: number;
  streak_best: number;
  last_tap_at: string | null;
  daily_today: string;
  daily_cap: string;
  current_multiplier: string;
  refs_l1_active: number;
  refs_l2_active: number;
  refs_l3_active: number;
  refs_l1_total: number;
  refs_l2_total: number;
  refs_l3_total: number;
  kyc_face_verified: boolean;
  pioneer_badge: boolean;
  security_circle_count: number;
};

export type MineChallenge = {
  challenge: string;
  difficulty: number;
  issued_at: number;
  ttl: number;
};

export type MineClaimResult = {
  address: string;
  reward: string;
  streak: number;
  multiplier: string;
  txid: string;
  session_id: string;
  next_claim_at: string;
};

export type LeaderboardEntry = {
  user_id: string;
  handle: string | null;
  display_name: string | null;
  total_mined: string;
  streak: number;
  refs: number;
  multiplier: string;
};

export type ChainInfo = {
  chain_id: string;
  total_blocks: number;
  total_txs: number;
  total_addresses: number;
  circulating_supply: string;
  hard_cap: string;
};
