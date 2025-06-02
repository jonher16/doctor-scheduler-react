import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Sign in function
  const login = async (email, password) => {
    try {
      setError(null);
      const result = await signInWithEmailAndPassword(auth, email, password);
      
      // Get user profile and role after successful login
      await loadUserProfile(result.user.uid);
      
      return result;
    } catch (error) {
      setError(error.message);
      throw error;
    }
  };

  // Sign out function
  const logout = async () => {
    try {
      setError(null);
      await signOut(auth);
      setCurrentUser(null);
      setUserRole(null);
      setUserProfile(null);
    } catch (error) {
      setError(error.message);
      throw error;
    }
  };

  // Create account function (for admin use)
  const createAccount = async (email, password, userData) => {
    try {
      setError(null);
      const result = await createUserWithEmailAndPassword(auth, email, password);
      
      // Create user profile with role
      await setDoc(doc(db, 'users', result.user.uid), {
        email: email,
        name: userData.name || '',
        role: userData.role || 'doctor',
        isAdmin: userData.isAdmin || false,
        isHersAdmin: userData.isHersAdmin || false,
        createdAt: new Date(),
        ...userData
      });
      
      return result;
    } catch (error) {
      setError(error.message);
      throw error;
    }
  };

  // Load user profile and role
  const loadUserProfile = async (uid) => {
    try {
      console.log('Loading doctor profile for UID:', uid);
      const doctorDoc = await getDoc(doc(db, 'doctors', uid));
      console.log('Doctor document exists:', doctorDoc.exists());
      
      if (doctorDoc.exists()) {
        const profile = doctorDoc.data();
        console.log('Doctor profile loaded:', profile);
        setUserProfile(profile);
        setUserRole(profile.role || 'doctor'); // Default to 'doctor' role if not specified
        return profile;
      } else {
        console.log('No doctor document found, creating basic profile');
        // If no profile exists, create a basic one
        const basicProfile = {
          email: auth.currentUser?.email,
          name: auth.currentUser?.displayName || '',
          role: 'doctor',
          isAdmin: false,
          isHersAdmin: false,
          createdAt: new Date()
        };
        await setDoc(doc(db, 'doctors', uid), basicProfile);
        setUserProfile(basicProfile);
        setUserRole('doctor');
        return basicProfile;
      }
    } catch (error) {
      console.error('Error loading doctor profile:', error);
      setError(error.message);
      return null;
    }
  };

  // Update user profile
  const updateUserProfile = async (uid, updates) => {
    try {
      setError(null);
      await setDoc(doc(db, 'doctors', uid), updates, { merge: true });
      
      // Reload profile if it's the current user
      if (uid === currentUser?.uid) {
        await loadUserProfile(uid);
      }
    } catch (error) {
      setError(error.message);
      throw error;
    }
  };

  // Get all users (admin function) - now gets all doctors
  const getAllUsers = async () => {
    try {
      const doctorsSnapshot = await getDocs(collection(db, 'doctors'));
      const doctors = [];
      doctorsSnapshot.forEach((doc) => {
        doctors.push({ id: doc.id, ...doc.data() });
      });
      return doctors;
    } catch (error) {
      console.error('Error fetching doctors:', error);
      setError(error.message);
      throw error;
    }
  };

  // Check if user has HERS admin access
  const hasHersAdminAccess = () => {
    console.log('Checking HERS admin access:', {
      userProfile,
      isHersAdmin: userProfile?.isHersAdmin,
      role: userProfile?.role,
      hasAccess: userProfile?.isHersAdmin === true || userProfile?.role === 'admin'
    });
    return userProfile?.isHersAdmin === true || userProfile?.role === 'admin';
  };

  // Check if user has admin access
  const hasAdminAccess = () => {
    return userProfile?.isAdmin === true || userProfile?.role === 'admin';
  };

  // Check if user has specific role
  const hasRole = (role) => {
    return userRole === role;
  };

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        setCurrentUser(user);
        
        if (user) {
          // Load user profile and role
          await loadUserProfile(user.uid);
        } else {
          setUserProfile(null);
          setUserRole(null);
        }
      } catch (error) {
        console.error('Error in auth state change:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userRole,
    userProfile,
    loading,
    error,
    login,
    logout,
    createAccount,
    updateUserProfile,
    getAllUsers,
    hasHersAdminAccess,
    hasAdminAccess,
    hasRole,
    setError
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 