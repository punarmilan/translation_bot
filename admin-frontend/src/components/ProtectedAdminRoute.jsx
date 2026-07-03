import { Navigate, Outlet } from "react-router-dom";
import { useAdminAuth } from "../state/AdminAuthContext";

export default function ProtectedAdminRoute() {
  const { admin, loading, forbidden } = useAdminAuth();
  if (loading) return <div className="admin-loading"><span /><p>Verifying admin access...</p></div>;
  if (forbidden) return <Navigate to="/admin/forbidden" replace />;
  if (!admin) return <Navigate to="/admin/login" replace />;
  return <Outlet />;
}
