import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins } from 'lucide-react';

const CoinAnimation = ({ show, coins, onComplete }) => {
  const [particles, setParticles] = useState([]);
  const [counter, setCounter] = useState(0);

  useEffect(() => {
    if (show && coins > 0) {
      // Create coin particles
      const newParticles = Array.from({ length: Math.min(20, coins / 5) }, (_, i) => ({
        id: i,
        x: Math.random() * 200 - 100,
        delay: Math.random() * 0.5,
      }));
      setParticles(newParticles);

      // Animate counter
      const duration = 2000;
      const steps = 30;
      const increment = coins / steps;
      let currentStep = 0;

      const interval = setInterval(() => {
        currentStep++;
        setCounter(Math.min(Math.round(increment * currentStep), coins));
        if (currentStep >= steps) {
          clearInterval(interval);
        }
      }, duration / steps);

      // Auto-complete after animation
      const timeout = setTimeout(() => {
        if (onComplete) onComplete();
      }, 4000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [show, coins, onComplete]);

  if (!show) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.9) 100%)' }}
      >
        {/* Coin Rain Effect */}
        <div className="absolute inset-0 overflow-hidden">
          {particles.map((particle) => (
            <motion.div
              key={particle.id}
              initial={{ y: -100, x: `calc(50% + ${particle.x}px)`, opacity: 1, rotate: 0 }}
              animate={{ 
                y: '120vh', 
                opacity: [1, 1, 0],
                rotate: 360 * 3
              }}
              transition={{ 
                duration: 3,
                delay: particle.delay,
                ease: 'easeIn'
              }}
              className="absolute"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-600 shadow-lg flex items-center justify-center border-2 border-yellow-400">
                <span className="text-yellow-900 font-bold text-xs">$</span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Main Content */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', duration: 0.8 }}
          className="relative z-10 text-center"
        >
          {/* Glow Effect */}
          <motion.div
            animate={{ 
              boxShadow: [
                '0 0 20px rgba(255, 215, 0, 0.3)',
                '0 0 60px rgba(255, 215, 0, 0.6)',
                '0 0 20px rgba(255, 215, 0, 0.3)'
              ]
            }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="absolute inset-0 rounded-full"
          />

          {/* Coin Icon */}
          <motion.div
            animate={{ 
              rotateY: [0, 360],
              scale: [1, 1.1, 1]
            }}
            transition={{ 
              rotateY: { duration: 2, repeat: Infinity, ease: 'linear' },
              scale: { duration: 0.5, repeat: Infinity }
            }}
            className="relative mx-auto mb-6 w-32 h-32 rounded-full bg-gradient-to-br from-yellow-300 via-yellow-400 to-yellow-600 shadow-2xl flex items-center justify-center border-4 border-yellow-300"
          >
            <Coins className="w-16 h-16 text-yellow-900" />
          </motion.div>

          {/* Text */}
          <motion.h2
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-3xl font-bold text-white mb-2"
          >
            🎉 Parabéns!
          </motion.h2>

          <motion.p
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-xl text-gray-300 mb-4"
          >
            Você ganhou
          </motion.p>

          {/* Coin Counter */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.7, type: 'spring' }}
            className="flex items-center justify-center gap-3"
          >
            <span className="text-6xl font-bold bg-gradient-to-r from-yellow-300 to-yellow-500 bg-clip-text text-transparent">
              +{counter}
            </span>
            <span className="text-2xl text-yellow-400 font-medium">moedas</span>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="mt-6 text-gray-400 text-sm"
          >
            Continue assim para alcançar o nível Faixa Preta! 🥋
          </motion.p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CoinAnimation;
