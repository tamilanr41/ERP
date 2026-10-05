import { motion, AnimatePresence } from 'framer-motion';

/** Section 46: subtle, purposeful motion only — no decorative animation. */

export const MotionPage = ({ children, className = '' }) => (
  <motion.div
    className={className}
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -4 }}
    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
  >
    {children}
  </motion.div>
);

export const MotionTab = ({ tabKey, children }) => (
  <AnimatePresence mode="wait" initial={false}>
    <motion.div
      key={tabKey}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.14, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  </AnimatePresence>
);

export const MotionDrawer = ({ open, side = 'right', children, onClose }) => (
  <AnimatePresence>
    {open && (
      <>
        <motion.div
          className="fixed inset-0 z-40 bg-black/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        />
        <motion.aside
          className={`fixed top-0 z-50 h-full w-full max-w-md overflow-y-auto border-l border-ink-200 bg-white shadow-overlay ${side === 'right' ? 'right-0' : 'left-0 border-l-0 border-r'}`}
          initial={{ x: side === 'right' ? 40 : -40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: side === 'right' ? 40 : -40, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          role="dialog"
          aria-modal="true"
        >
          {children}
        </motion.aside>
      </>
    )}
  </AnimatePresence>
);

export const MotionModal = ({ open, children, onClose, maxWidth = 'max-w-lg' }) => (
  <AnimatePresence>
    {open && (
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
        <motion.div
          className="fixed inset-0 bg-black/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        />
        <motion.div
          className={`relative z-10 w-full ${maxWidth} card my-auto`}
          initial={{ opacity: 0, scale: 0.98, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 4 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          role="dialog"
          aria-modal="true"
        >
          {children}
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

export const MotionRow = ({ children, index = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 4 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.14, delay: Math.min(index * 0.015, 0.2) }}
  >
    {children}
  </motion.div>
);

export const MotionStagger = ({ children, className = '' }) => (
  <motion.div
    className={className}
    initial="hidden"
    animate="show"
    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.03 } } }}
  >
    {children}
  </motion.div>
);

export const MotionItem = ({ children, className = '' }) => (
  <motion.div
    className={className}
    variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
    transition={{ duration: 0.16, ease: 'easeOut' }}
  >
    {children}
  </motion.div>
);

export { motion, AnimatePresence };
