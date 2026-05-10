-- Migration 025: Alinhar CHECK constraint de coin_transactions com valores reais do backend
-- BUG ATIVO: constraint original ('earn','redeem','bonus','penalty') não incluía os valores
-- que gamification.py insere ('earn_engagement','earn_checkout','spend_reward','refund'),
-- causando violação de constraint recorrente nos logs Postgres.

ALTER TABLE coin_transactions
  DROP CONSTRAINT IF EXISTS coin_transactions_transaction_type_check;

ALTER TABLE coin_transactions
  ADD CONSTRAINT coin_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'earn', 'redeem', 'bonus', 'penalty',
    'earn_engagement', 'earn_checkout', 'spend_reward', 'refund'
  ));
