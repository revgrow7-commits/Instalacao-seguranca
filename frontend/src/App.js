import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from 'sonner';
import './App.css';

// Lazy load all pages for better performance
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const InstallerDashboard = lazy(() => import('./pages/InstallerDashboard'));
const InstallerJobDetail = lazy(() => import('./pages/InstallerJobDetail'));
const InstallerCalendar = lazy(() => import('./pages/InstallerCalendar'));
const Jobs = lazy(() => import('./pages/Jobs'));
const JobDetail = lazy(() => import('./pages/JobDetail'));
const Users = lazy(() => import('./pages/Users'));
const Calendar = lazy(() => import('./pages/Calendar'));
const CheckinViewer = lazy(() => import('./pages/CheckinViewer'));
const Checkins = lazy(() => import('./pages/Checkins'));
const UnifiedReports = lazy(() => import('./pages/UnifiedReports'));
const FamilyReport = lazy(() => import('./pages/FamilyReport'));
const InstallerReport = lazy(() => import('./pages/InstallerReport'));
const FamilyKPIsReport = lazy(() => import('./pages/FamilyKPIsReport'));
const Profile = lazy(() => import('./pages/Profile'));
const LojaFaixaPreta = lazy(() => import('./pages/LojaFaixaPreta'));
const GamificationReport = lazy(() => import('./pages/GamificationReport'));
const SchedulerAdmin = lazy(() => import('./pages/SchedulerAdmin'));
const TrelloPCP = lazy(() => import('./pages/TrelloPCP'));

// Non-lazy imports for layout components (always needed)
import Sidebar from './components/layout/Sidebar';
import BottomNav from './components/layout/BottomNav';
import UpdateNotification from './components/UpdateNotification';

// Loading spinner component
const PageLoader = () => (
  <div className="flex items-center justify-center h-[50vh]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="loading-pulse text-primary text-2xl font-heading">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

const MainLayout = ({ children }) => {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="md:pl-64 flex flex-col flex-1">
        <main className="flex-1 pb-20 md:pb-0">
          <Suspense fallback={<PageLoader />}>
            {children}
          </Suspense>
        </main>
        <BottomNav />
      </div>
    </div>
  );
};

const AppRoutes = () => {
  const { user } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? <Navigate to="/dashboard" replace /> : (
            <Suspense fallback={<PageLoader />}>
              <Login />
            </Suspense>
          )
        }
      />
      <Route
        path="/register"
        element={
          user ? <Navigate to="/dashboard" replace /> : (
            <Suspense fallback={<PageLoader />}>
              <Register />
            </Suspense>
          )
        }
      />
      <Route
        path="/forgot-password"
        element={
          user ? <Navigate to="/dashboard" replace /> : (
            <Suspense fallback={<PageLoader />}>
              <ForgotPassword />
            </Suspense>
          )
        }
      />
      <Route
        path="/reset-password"
        element={
          user ? <Navigate to="/dashboard" replace /> : (
            <Suspense fallback={<PageLoader />}>
              <ResetPassword />
            </Suspense>
          )
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <MainLayout>
              <Dashboard />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/jobs"
        element={
          <ProtectedRoute>
            <MainLayout>
              <Jobs />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/jobs/:jobId"
        element={
          <ProtectedRoute>
            <MainLayout>
              <JobDetail />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute>
            <MainLayout>
              <Users />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/calendar"
        element={
          <ProtectedRoute>
            <MainLayout>
              <Calendar />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/installer/dashboard"
        element={
          <ProtectedRoute>
            <MainLayout>
              <InstallerDashboard />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      {/* Removed obsolete routes: /checkin/:jobId and /checkout/:checkinId
          These were replaced by the item-based check-in/out flow in InstallerJobDetail */}
      <Route
        path="/checkin-viewer/:checkinId"
        element={
          <ProtectedRoute>
            <MainLayout>
              <CheckinViewer />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/checkins"
        element={
          <ProtectedRoute>
            <MainLayout>
              <Checkins />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UnifiedReports />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports/family"
        element={
          <ProtectedRoute>
            <MainLayout>
              <FamilyReport />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports/installer"
        element={
          <ProtectedRoute>
            <MainLayout>
              <InstallerReport />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports/kpis"
        element={
          <ProtectedRoute>
            <MainLayout>
              <FamilyKPIsReport />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      {/* Redirect old productivity route to unified reports */}
      <Route
        path="/reports/productivity"
        element={<Navigate to="/reports" replace />}
      />
      {/* Redirect old metrics route to unified reports */}
      <Route
        path="/metrics"
        element={<Navigate to="/reports" replace />}
      />
      <Route
        path="/installer/calendar"
        element={
          <ProtectedRoute>
            <MainLayout>
              <InstallerCalendar />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/installer/job/:jobId"
        element={
          <ProtectedRoute>
            <InstallerJobDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <MainLayout>
              <Profile />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/loja-faixa-preta"
        element={
          <ProtectedRoute>
            <MainLayout>
              <LojaFaixaPreta />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/gamification-report"
        element={
          <ProtectedRoute>
            <MainLayout>
              <GamificationReport />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/scheduler"
        element={
          <ProtectedRoute>
            <MainLayout>
              <SchedulerAdmin />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={<Navigate to={user ? "/dashboard" : "/login"} replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="dark">
          <AppRoutes />
          <UpdateNotification />
          <Toaster 
            position="top-right"
            toastOptions={{
              style: {
                background: 'hsl(var(--card))',
                color: 'hsl(var(--foreground))',
                border: '1px solid hsl(var(--border))',
              },
            }}
          />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;