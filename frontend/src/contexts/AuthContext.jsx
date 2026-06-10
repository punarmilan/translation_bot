import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getMe, login as apiLogin, signup as apiSignup } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setLoading(false);
      return;
    }
    getMe()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem("access_token");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await apiLogin(email, password);
    localStorage.setItem("access_token", data.access_token);
    setUser({
      user_id: data.user_id,
      username: data.username,
      role: data.role,
      preferred_language: data.preferred_language,
    });
    return data;
  }, []);

  const signup = useCallback(async (username, email, password, role, preferred_language) => {
    const data = await apiSignup(username, email, password, role, preferred_language);
    localStorage.setItem("access_token", data.access_token);
    setUser({
      user_id: data.user_id,
      username: data.username,
      role: data.role,
      preferred_language: data.preferred_language,
    });
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("access_token");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
