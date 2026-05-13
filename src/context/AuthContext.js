import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Initialize session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchProfile(session.user);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          fetchProfile(session.user);
        } else {
          setUser(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (authUser) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();
        
      if (error) throw error;
      setUser({ ...authUser, ...(data || {}) });
    } catch (e) {
      console.error(e);
      // Fallback if profile fails
      setUser(authUser);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };
    return { success: true };
  };

  const signup = async (email, password, metadata) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata }
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const updateUser = async (updates) => {
    const originalUser = { ...user };
    const updated = { ...user, ...updates };
    setUser(updated); // Optimistic UI
    
    try {
      // Use upsert to handle new users who don't have a record in `profiles` yet
      const { error } = await supabase.from('profiles').upsert({ id: user.id, ...updates });
      if (error) {
        console.error("Supabase update error:", error);
        setUser(originalUser); // Revert optimistic update
        alert(`Failed to save profile: ${error.message}\nIf you recently added new fields (like username or bio), make sure those columns exist in your Supabase 'profiles' table!`);
      }
    } catch (err) {
      console.error(err);
      setUser(originalUser);
      alert(`Unexpected error saving profile: ${err.message}`);
    }
  };

  const addPoints = async (pts) => {
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];
    const lastStudy = user.last_study_date;
    
    let streakBonus = 0;
    let streakUpdates = {};

    // Check if we should update streak (once per day)
    if (lastStudy !== today) {
      let newStreak = (user.streak || 0) + 1;
      
      if (lastStudy) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        if (lastStudy !== yesterdayStr) {
          newStreak = 1; // Reset if a day was missed
        }
      }

      streakBonus = 50; // Base bonus for studying today
      if (newStreak % 7 === 0) streakBonus += 200; // Weekly bonus
      if (newStreak % 30 === 0) streakBonus += 1000; // Monthly bonus
      
      streakUpdates = { 
        streak: newStreak, 
        last_study_date: today 
      };
      
      console.log(`Streak updated! New streak: ${newStreak}. Bonus: ${streakBonus} XP`);
    }

    const newPoints = (user.points || 0) + pts + streakBonus;
    const finalUpdates = { ...streakUpdates, points: newPoints };

    // Optimistic Update
    setUser(prev => ({ ...prev, ...finalUpdates }));

    try {
      const { error } = await supabase
        .from('profiles')
        .update(finalUpdates)
        .eq('id', user.id);
        
      if (error) throw error;
    } catch (err) {
      console.error("Failed to update points/streak:", err);
      // Revert if DB fails? For now, we'll just log it to keep UI snappy
    }
  };

  const recordStudySession = () => addPoints(0); // Helper for when they study but don't earn specific points

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, updateUser, addPoints, recordStudySession, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
