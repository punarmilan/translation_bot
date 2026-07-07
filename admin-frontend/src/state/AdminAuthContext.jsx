import { createContext, useContext, useEffect, useState } from "react";
import { adminLogin, adminLogout, verifyAdmin } from "../services/api";

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    verifyAdmin()
      .then(({ admin: profile }) => { setAdmin(profile); setForbidden(false); })
      .catch((error) => setForbidden(error.response?.status === 403))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const expire = () => { setAdmin(null); setForbidden(false); };
    window.addEventListener("admin-session-expired", expire);
    return () => window.removeEventListener("admin-session-expired", expire);
  }, []);

  const login = async (email, password) => {
    setForbidden(false);
    try {
      const response = await adminLogin(email, password);
      setAdmin(response.admin);
      return response.admin;
    } catch (error) {
      if (error.response?.status === 403) setForbidden(true);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await adminLogout();
    } finally {
      setAdmin(null);
      setForbidden(false);
    }
  };

  return <AdminAuthContext.Provider value={{ admin, loading, forbidden, login, logout }}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const value = useContext(AdminAuthContext);
  if (!value) throw new Error("useAdminAuth must be used inside AdminAuthProvider");
  return value;
}
