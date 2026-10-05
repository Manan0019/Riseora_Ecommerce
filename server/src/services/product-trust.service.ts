import { prisma } from "../config/prisma";

const THEME_RULES = [
  { key: "texture", label: "Texture", terms: ["texture", "smooth", "lightweight", "light weight", "sticky", "greasy", "soft"] },
  { key: "fragrance", label: "Fragrance", terms: ["fragrance", "smell", "scent", "aroma"] },
  { key: "packaging", label: "Packaging", terms: ["packaging", "bottle", "pump", "cap", "pack"] },
  { key: "value", label: "Value", terms: ["value", "price", "worth", "affordable"] },
  { key: "routine", label: "Routine fit", terms: ["routine", "daily", "morning", "evening", "regular"] },
  { key: "quality", label: "Quality", terms: ["quality", "premium", "well made"] },
] as const;

type ReviewLike = {
  id: string;
  rating: number;
  title?: string | null;
  comment?: string | null;
  images?: unknown;
  verifiedPurchase?: boolean | null;
  createdAt?: Date | string | null;
};

function imageCount(review: ReviewLike) {
  return Array.isArray(review.images) ? review.images.length : 0;
}

export function reviewTrustScore(review: ReviewLike) {
  const commentLength = String(review.comment || "").trim().length;
  const detailScore = commentLength >= 240 ? 5 : commentLength >= 120 ? 3 : commentLength >= 50 ? 2 : 0;
  return (review.verifiedPurchase ? 12 : 0)
    + (imageCount(review) > 0 ? 5 : 0)
    + (String(review.title || "").trim() ? 1 : 0)
    + detailScore;
}

export function enrichReviewsForTrust<T extends ReviewLike>(reviews: T[]) {
  return reviews
    .map((review) => ({ ...review, reviewTrustScore: reviewTrustScore(review), hasReviewPhotos: imageCount(review) > 0 }))
    .sort((a, b) => {
      const score = b.reviewTrustScore - a.reviewTrustScore;
      if (score) return score;
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
}

export function reviewTrustSummary(reviews: ReviewLike[]) {
  const total = reviews.length;
  const verifiedCount = reviews.filter((review) => Boolean(review.verifiedPurchase)).length;
  const photoCount = reviews.filter((review) => imageCount(review) > 0).length;
  const ratings = [5, 4, 3, 2, 1].map((rating) => ({ rating, count: reviews.filter((review) => Number(review.rating) === rating).length }));

  const themeCounts = new Map<string, { key: string; label: string; mentions: number }>();
  for (const review of reviews) {
    const text = `${review.title || ""} ${review.comment || ""}`.toLowerCase();
    for (const rule of THEME_RULES) {
      if (!rule.terms.some((term) => text.includes(term))) continue;
      const current = themeCounts.get(rule.key) || { key: rule.key, label: rule.label, mentions: 0 };
      current.mentions += 1;
      themeCounts.set(rule.key, current);
    }
  }

  const commonThemes = [...themeCounts.values()]
    .filter((item) => item.mentions >= 2)
    .sort((a, b) => b.mentions - a.mentions || a.label.localeCompare(b.label))
    .slice(0, 5);

  return {
    total,
    verifiedCount,
    verifiedPercent: total ? Math.round((verifiedCount / total) * 100) : 0,
    photoCount,
    photoPercent: total ? Math.round((photoCount / total) * 100) : 0,
    ratings,
    commonThemes,
    methodology: "Approved reviews only. Themes count neutral keyword mentions and do not infer medical efficacy or sentiment.",
  };
}

export async function communityTrustHealth() {
  const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [
    approvedReviews,
    pendingReviews,
    verifiedReviews,
    ratingAggregate,
    approvedLast30Days,
    photoRows,
    publishedQuestions,
    pendingQuestions,
  ] = await Promise.all([
    prisma.review.count({ where: { isApproved: true } }),
    prisma.review.count({ where: { isApproved: false } }),
    prisma.review.count({ where: { isApproved: true, verifiedPurchase: true } }),
    prisma.review.aggregate({ where: { isApproved: true }, _avg: { rating: true } }),
    prisma.review.count({ where: { isApproved: true, createdAt: { gte: last30Days } } }),
    prisma.review.findMany({ where: { isApproved: true }, select: { images: true } }),
    prisma.productQuestion.count({ where: { isPublished: true, answer: { not: null } } }),
    prisma.productQuestion.count({ where: { isPublished: false } }),
  ]);

  const photoReviews = photoRows.filter((review) => Array.isArray(review.images) && review.images.length > 0).length;
  return {
    approvedReviews,
    pendingReviews,
    verifiedReviews,
    verifiedShare: approvedReviews ? Number(((verifiedReviews / approvedReviews) * 100).toFixed(1)) : 0,
    photoReviews,
    photoShare: approvedReviews ? Number(((photoReviews / approvedReviews) * 100).toFixed(1)) : 0,
    averageRating: Number(Number(ratingAggregate._avg.rating || 0).toFixed(2)),
    approvedLast30Days,
    publishedQuestions,
    pendingQuestions,
    methodology: "Operational trust health from existing approved reviews and moderated product Q&A. No new customer profiling store.",
  };
}
