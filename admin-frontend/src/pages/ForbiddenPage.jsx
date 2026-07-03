import { ShieldX } from "lucide-react";
import { Link } from "react-router-dom";
import { useAdminAuth } from "../state/AdminAuthContext";

export default function ForbiddenPage() {
  const { logout } = useAdminAuth();
  return <div className="admin-forbidden"><ShieldX size={44} /><span>403 Unauthorized</span><h1>Admin access required</h1><p>This portal is restricted to users whose current account role is admin.</p><Link to="/admin/login" onClick={logout}>Return to admin login</Link></div>;
}
