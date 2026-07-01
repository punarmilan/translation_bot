import { Component } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ChatPage from "./pages/ChatPage";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import SignupPage from "./pages/SignupPage";
import VoiceTestPage from "./pages/VoiceTestPage";

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  return user ? <Navigate to={`/chat${location.search}`} replace /> : children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/login"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route
        path="/signup"
        element={
          <GuestOnly>
            <SignupPage />
          </GuestOnly>
        }
      />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/voice-test" element={<VoiceTestPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-brand-dark flex items-center justify-center p-6">
          <div className="max-w-lg rounded-xl border border-red-400/30 bg-red-500/10 p-5 text-red-100">
            <h1 className="text-lg font-semibold mb-2">Frontend error</h1>
            <p className="text-sm">{this.state.error.message || "The app crashed."}</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
