import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { SubscriptionProvider, useSubscription } from "@/contexts/SubscriptionContext";
import Layout from "@/components/Layout";
import TransactionHall from "@/pages/TransactionHall";
import MyAssets from "@/pages/MyAssets";
import ExpenseCalendar from "@/pages/ExpenseCalendar";
import DataDashboard from "@/pages/DataDashboard";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import TuitionSandbox from "@/pages/TuitionSandbox";
import SetupModal from "@/components/SetupModal";
import UpgradeModal from "@/components/UpgradeModal";
import NotFound from "./pages/NotFound";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, authLoading, setupCompleted, setSetupCompleted, t } = useApp();
  
  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">{t.common.loading}</div>;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!setupCompleted) {
    return (
      <SetupModal 
        open={true} 
        onComplete={() => setSetupCompleted(true)} 
      />
    );
  }
  
  return children;
};

const UpgradeModalWrapper = () => {
  const { upgradeModalVisible, hideUpgradeModal } = useSubscription();
  return <UpgradeModal open={upgradeModalVisible} onClose={hideUpgradeModal} />;
};

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SubscriptionProvider>
          <AppProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/tuition-sandbox" element={<TuitionSandbox />} />
              <Route path="/" element={
                <ProtectedRoute>
                  <Layout>
                    <Navigate to="/transactions" replace />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/transactions" element={
                <ProtectedRoute>
                  <Layout>
                    <TransactionHall />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/assets" element={
                <ProtectedRoute>
                  <Layout>
                    <MyAssets />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <Layout>
                    <DataDashboard />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/calendar" element={
                <ProtectedRoute>
                  <Layout>
                    <ExpenseCalendar />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <UpgradeModalWrapper />
          </AppProvider>
        </SubscriptionProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
