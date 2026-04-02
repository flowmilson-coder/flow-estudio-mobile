import React, { useState, useEffect } from 'react';
import { auth, googleProvider, db } from '../lib/firebase';
import { signInWithPopup, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { LogIn, LogOut, Music } from 'lucide-react';

export default function Auth({ onUserChange }: { onUserChange: (user: User | null) => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      onUserChange(currentUser);
      setLoading(false);

      if (currentUser) {
        // Ensure user document exists
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          const isAdminEmail = currentUser.email === 'domingosafonso833@gmail.com';
          await setDoc(userRef, {
            uid: currentUser.uid,
            displayName: currentUser.displayName,
            email: currentUser.email,
            photoURL: currentUser.photoURL,
            role: isAdminEmail ? 'admin' : 'user',
            status: isAdminEmail ? 'active' : 'pending_payment',
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
          });
        } else {
          await updateDoc(userRef, {
            lastLogin: serverTimestamp(),
          });
        }
      }
    });
    return unsubscribe;
  }, [onUserChange]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading) return null;

  return (
    <div className="flex items-center gap-4">
      {user ? (
        <div className="flex items-center gap-3">
          <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-white/20" referrerPolicy="no-referrer" />
          <span className="text-sm font-medium text-white/80 hidden sm:inline">{user.displayName}</span>
          <button
            onClick={handleLogout}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      ) : (
        <button
          onClick={handleLogin}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-medium transition-all shadow-lg shadow-indigo-500/20"
        >
          <LogIn size={18} />
          <span>Entrar com Google</span>
        </button>
      )}
    </div>
  );
}
