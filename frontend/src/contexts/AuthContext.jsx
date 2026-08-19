import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  getMe,
  login as apiLogin,
  signup as apiSignup,
  updateMe as apiUpdateMe,
} from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    getMe()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Dispatched by services/api.js's response interceptor when a 401
    // survives a refresh attempt (refresh token missing, expired, or
    // rejected) -- clears the signed-in user so ChatPage/ProfilePage's
    // existing `if (!user) return <Navigate to="/login" />` guards send
    // them back to sign in, instead of the app quietly continuing to look
    // "logged in" while every API call 401s.
    const handleSessionExpired = () => setUser(null);
    window.addEventListener("session-expired", handleSessionExpired);
    return () => window.removeEventListener("session-expired", handleSessionExpired);
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await apiLogin(email, password);
    localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
    if (data.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
    const profile = await getMe();
    setUser(profile);
    return profile;
  }, []);

  const signup = useCallback(async (profile) => {
    const data = await apiSignup(profile);
    return data;
  }, []);

  const updateProfile = useCallback(async (profile) => {
    const data = await apiUpdateMe(profile);
    setUser(data);
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, signup, updateProfile, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
