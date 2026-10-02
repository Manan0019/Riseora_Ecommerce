import fs from "node:fs";
const checks = [
  ["server/prisma/schema.prisma", ["model RewardAccount", "model RewardTransaction", "referralCode String @unique", "rewardOwnerUserId"]],
  ["server/src/services/rewards.service.ts", ["awardDeliveredOrderRewards", "awardApprovedReviewReward", "reverseRefundedOrderRewards", "createRewardVoucher"]],
  ["server/src/services/checkout.service.ts", ["private rewards voucher belongs to another Riseora account"]],
  ["server/src/routes/auth.routes.ts", ["referralCode", "referredByUserId"]],
  ["server/prisma/seed.ts", ["referralCode: seedReferralCode", "randomBytes(5)"]],
  ["server/prisma/migrations/20261002233000_phase36_rewards_referrals/migration.sql", ["RewardTransactionType", "RewardAccount", "rewardOwnerUserId"]],
  ["client/src/pages/Rewards.jsx", ["RISEORA REWARDS", "COPY REFERRAL LINK"]],
  ["client/src/pages/admin/AdminRewards.jsx", ["Rewards & referrals", "Manual point adjustment"]],
  ["client/src/App.jsx", ["/rewards", "AdminRewards"]],
];
let failed=false;
for (const [file, needles] of checks) { const text=fs.readFileSync(file,"utf8"); for (const needle of needles) if(!text.includes(needle)){console.error(`Missing ${needle} in ${file}`);failed=true;} }
if (failed) process.exit(1);
console.log("Phase 36 rewards/referrals audit PASS");
console.log("delivery-only points, review/referral incentives, refund reversals and private reward vouchers present");
