import { createContext, useContext, useEffect, useState } from "react";
import { adminLogin, verifyAdmin } from "../services/api";

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("admin_access_token")) {
      setLoading(false);
      return;
    }
    verifyAdmin()
      .then((profile) => { setAdmin(profile); setForbidden(false); })
      .catch((error) => {
        localStorage.removeItem("admin_access_token");
        setForbidden(error.response?.status === 403);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    setForbidden(false);
    try {
      const response = await adminLogin(email, password);
      localStorage.setItem("admin_access_token", response.access_token);
      const profile = await verifyAdmin();
      setAdmin(profile);
      return profile;
    } catch (error) {
      localStorage.removeItem("admin_access_token");
      if (error.response?.status === 403) setForbidden(true);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem("admin_access_token");
    setAdmin(null);
    setForbidden(false);
  };

  return <AdminAuthContext.Provider value={{ admin, loading, forbidden, login, logout }}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const value = useContext(AdminAuthContext);
  if (!value) throw new Error("useAdminAuth must be used inside AdminAuthProvider");
  return value;
}
