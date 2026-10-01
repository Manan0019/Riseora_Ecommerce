import { motion } from "framer-motion";

export default function HeroSection() {
  return (
    <section className="riseora-hero">
      <motion.div initial={{opacity:0,y:30}} animate={{opacity:1,y:0}}>
        <h1>Ancient Ayurveda. Modern Care.</h1>
        <p>Natural wellness crafted with powerful herbal ingredients.</p>
        <button>Explore Collection</button>
      </motion.div>
    </section>
  );
}