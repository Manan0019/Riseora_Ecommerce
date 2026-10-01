export const imageRules = {
  allowedFormats: ["jpg", "jpeg", "png", "webp"],
  maxSizeMB: 10,
  recommendedProductSize: "1200x1200"
};

export function validateImage(file) {
  return Boolean(file);
}