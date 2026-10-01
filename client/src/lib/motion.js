export const luxuryMotion = {
  duration: { fast: 0.2, normal: 0.4, slow: 0.7 },
  ease: [0.22, 1, 0.36, 1],
};

export const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: {
    duration: luxuryMotion.duration.normal,
    ease: luxuryMotion.ease,
  },
};