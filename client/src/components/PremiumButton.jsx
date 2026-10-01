import { motion } from "framer-motion";

export default function PremiumButton({children, ...props}) {
 return (
  <motion.button whileHover={{scale:1.03}} whileTap={{scale:0.97}} {...props}>
   {children}
  </motion.button>
 );
}