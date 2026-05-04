-- RUN THIS IN YOUR SUPABASE SQL EDITOR
-- This adds the necessary columns for the gamification system (Streaks)

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_study_date DATE;
