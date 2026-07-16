import { Component, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import ChatPage from "./pages/ChatPage";
import DocsPage from "./pages/DocsPage";
import FeaturesPage from "./pages/FeaturesPage";
import HelpPage from "./pages/HelpPage";
import HowItWorksPage from "./pages/HowItWorksPage";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import PricingPage from "./pages/PricingPage";
import SignupPage from "./pages/SignupPage";
import SolutionsPage from "./pages/SolutionsPage";
import VoiceTestPage from "./pages/VoiceTestPage";
import BlogPage from "./pages/BlogPage";

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  return user ? <Navigate to={`/chat${location.search}`} replace /> : children;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({
        top: 0,
        behavior: "auto",
    });
}, [pathname]);
  return null;
}

function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/solutions" element={<SolutionsPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/blog/:slug" element={<BlogPage />} />
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
    </>
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
        <ThemeProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
