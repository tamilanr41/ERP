import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AppLayout from './components/layout/AppLayout';
import { LoadingState } from './components/ui/Feedback';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const PatientList = lazy(() => import('./pages/patients/PatientList'));
const PatientDetail = lazy(() => import('./pages/patients/PatientDetail'));
const PatientForm = lazy(() => import('./pages/patients/PatientForm'));
const Appointments = lazy(() => import('./pages/Appointments'));
const QueueBoard = lazy(() => import('./pages/QueueBoard'));
const OpdQueueBoard = lazy(() => import('./pages/opd/OpdQueueBoard'));
const OpdPage = lazy(() => import('./pages/OpdPage'));
const OpdWorkspace = lazy(() => import('./pages/opd/OpdWorkspace'));
const OpdDashboard = lazy(() => import('./pages/opd/OpdDashboard'));
const OpdPatientSearch = lazy(() => import('./pages/opd/OpdPatientSearch'));
const NurseVitals = lazy(() => import('./pages/opd/NurseVitals'));
const ConsultationWorkstation = lazy(() => import('./pages/opd/ConsultationWorkstation'));
const PrescriptionsScreen = lazy(() => import('./pages/opd/PrescriptionsScreen'));
const FollowUpScreen = lazy(() => import('./pages/opd/FollowUpScreen'));
const ReferralsScreen = lazy(() => import('./pages/opd/ReferralsScreen'));
const OpdRegistration = lazy(() => import('./pages/opd/OpdRegistration'));
const OpCompletion = lazy(() => import('./pages/opd/OpCompletion'));
const OpdDocuments = lazy(() => import('./pages/opd/OpdDocuments'));
const IpdWorkspace = lazy(() => import('./pages/ipd/IpdWorkspace'));
const IpdDashboard = lazy(() => import('./pages/ipd/IpdDashboard'));
const IpdAdmissions = lazy(() => import('./pages/ipd/IpdAdmissions'));
const IpdAdmissionWorkspace = lazy(() => import('./pages/ipd/IpdAdmissionWorkspace'));
const IpdWardBoard = lazy(() => import('./pages/ipd/IpdWardBoard'));
const IpdHierarchy = lazy(() => import('./pages/ipd/IpdHierarchy'));
const IpdBillingDesk = lazy(() => import('./pages/ipd/IpdBillingDesk'));
const IpdReports = lazy(() => import('./pages/ipd/IpdReports'));
const IpdWorkstation = lazy(() => import('./pages/ipd/IpdWorkstation'));
const DialysisWorkspace = lazy(() => import('./pages/dialysis/DialysisWorkspace'));
const DialysisCommandCenter = lazy(() => import('./pages/dialysis/DialysisCommandCenter'));
const DialysisRegister = lazy(() => import('./pages/dialysis/DialysisRegister'));
const DialysisPatients = lazy(() => import('./pages/dialysis/DialysisPatients'));
const DialysisPatient360 = lazy(() => import('./pages/dialysis/DialysisPatient360'));
const DialysisSession = lazy(() => import('./pages/dialysis/DialysisSession'));
const DialysisMachines = lazy(() => import('./pages/dialysis/DialysisMachines'));
const DialysisReports = lazy(() => import('./pages/dialysis/DialysisReports'));
const DialysisAssessment = lazy(() => import('./pages/dialysis/DialysisAssessment'));
const DialysisPrescriptions = lazy(() => import('./pages/dialysis/DialysisPrescriptions'));
const DialysisSchedule = lazy(() => import('./pages/dialysis/DialysisSchedule'));
const DialysisSlots = lazy(() => import('./pages/dialysis/DialysisSlots'));
const Pharmacy = lazy(() => import('./pages/Pharmacy'));
const Lab = lazy(() => import('./pages/Lab'));
const Billing = lazy(() => import('./pages/Billing'));
const CashierClosing = lazy(() => import('./pages/CashierClosing'));
const Insurance = lazy(() => import('./pages/Insurance'));
const Reports = lazy(() => import('./pages/Reports'));
const Users = lazy(() => import('./pages/Users'));
const Notifications = lazy(() => import('./pages/Notifications'));
const ModuleLanding = lazy(() => import('./pages/ModuleLanding'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const Settings = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));

const Protected = ({ children }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

const Lazy = ({ children }) => <Suspense fallback={<LoadingState />}>{children}</Suspense>;

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Lazy><Login /></Lazy>} />
      <Route
        path="/"
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route index element={<Lazy><Dashboard /></Lazy>} />
        <Route path="modules/:key" element={<Lazy><ModuleLanding /></Lazy>} />
        <Route path="patients" element={<Lazy><PatientList /></Lazy>} />
        <Route path="patients/new" element={<Lazy><OpdRegistration /></Lazy>} />
        <Route path="patients/:id/edit" element={<Lazy><PatientForm /></Lazy>} />
        <Route path="patients/:id" element={<Lazy><PatientDetail /></Lazy>} />
<Route path="appointments" element={<Lazy><Appointments /></Lazy>} />
          <Route path="queue" element={<Lazy><OpdQueueBoard /></Lazy>} />
          <Route path="appointments-queue" element={<Lazy><QueueBoard /></Lazy>} />
        <Route path="opd" element={<Lazy><OpdWorkspace /></Lazy>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Lazy><OpdDashboard /></Lazy>} />
          <Route path="registration" element={<Lazy><OpdRegistration /></Lazy>} />
          <Route path="search" element={<Lazy><OpdPatientSearch /></Lazy>} />
          <Route path="appointments" element={<Lazy><Appointments /></Lazy>} />
          <Route path="queue" element={<Lazy><QueueBoard /></Lazy>} />
          <Route path="walkin" element={<Lazy><OpdPage /></Lazy>} />
          <Route path="vitals" element={<Lazy><NurseVitals /></Lazy>} />
          <Route path="consultation" element={<Lazy><ConsultationWorkstation /></Lazy>} />
          <Route path="prescriptions" element={<Lazy><PrescriptionsScreen /></Lazy>} />
          <Route path="referrals" element={<Lazy><ReferralsScreen /></Lazy>} />
          <Route path="followup" element={<Lazy><FollowUpScreen /></Lazy>} />
          <Route path="completion/:id" element={<Lazy><OpCompletion /></Lazy>} />
          <Route path="documents" element={<Lazy><OpdDocuments /></Lazy>} />
          <Route path="orders" element={<Lazy><Lab /></Lazy>} />
          <Route path="billing" element={<Lazy><Billing /></Lazy>} />
          <Route path="refunds" element={<Lazy><Billing /></Lazy>} />
          <Route path="payments" element={<Lazy><CashierClosing /></Lazy>} />
          <Route path="reports" element={<Lazy><Reports /></Lazy>} />
          <Route path="settings" element={<Lazy><Settings /></Lazy>} />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Route>
        <Route path="ipd" element={<Lazy><IpdWorkspace /></Lazy>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Lazy><IpdDashboard /></Lazy>} />
          <Route path="admissions" element={<Lazy><IpdAdmissions /></Lazy>} />
          <Route path="admission/:id" element={<Lazy><IpdAdmissionWorkspace /></Lazy>} />
          <Route path="wards" element={<Lazy><IpdWardBoard /></Lazy>} />
          <Route path="hierarchy" element={<Lazy><IpdHierarchy /></Lazy>} />
          <Route path="billing" element={<Lazy><IpdBillingDesk /></Lazy>} />
          <Route path="reports" element={<Lazy><IpdReports /></Lazy>} />
          <Route path="workstations" element={<Lazy><IpdWorkstation /></Lazy>} />
          <Route path="workstation/:mode" element={<Lazy><IpdWorkstation /></Lazy>} />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Route>
        <Route path="dialysis" element={<Lazy><DialysisWorkspace /></Lazy>}>
          <Route index element={<Lazy><DialysisCommandCenter /></Lazy>} />
          <Route path="patients" element={<Lazy><DialysisPatients /></Lazy>} />
          <Route path="register" element={<Lazy><DialysisRegister /></Lazy>} />
          <Route path="patient/:id" element={<Lazy><DialysisPatient360 /></Lazy>} />
          <Route path="session/:id" element={<Lazy><DialysisSession /></Lazy>} />
          <Route path="machines" element={<Lazy><DialysisMachines /></Lazy>} />
          <Route path="assessment" element={<Lazy><DialysisAssessment /></Lazy>} />
          <Route path="prescriptions" element={<Lazy><DialysisPrescriptions /></Lazy>} />
          <Route path="schedule" element={<Lazy><DialysisSchedule /></Lazy>} />
          <Route path="slots" element={<Lazy><DialysisSlots /></Lazy>} />
          <Route path="reports" element={<Lazy><DialysisReports /></Lazy>} />
          <Route path="billing" element={<Lazy><Billing /></Lazy>} />
          <Route path="*" element={<Navigate to="/dialysis" replace />} />
        </Route>
        <Route path="beds" element={<Navigate to="/ipd/wards" replace />} />
        <Route path="pharmacy" element={<Lazy><Pharmacy /></Lazy>} />
        <Route path="lab" element={<Lazy><Lab /></Lazy>} />
        <Route path="billing" element={<Lazy><Billing /></Lazy>} />
        <Route path="cashier" element={<Lazy><CashierClosing /></Lazy>} />
        <Route path="insurance" element={<Lazy><Insurance /></Lazy>} />
        <Route path="reports" element={<Lazy><Reports /></Lazy>} />
        <Route path="users" element={<Lazy><Users /></Lazy>} />
        <Route path="notifications" element={<Lazy><Notifications /></Lazy>} />
        <Route path="audit" element={<Lazy><AuditLogs /></Lazy>} />
        <Route path="settings" element={<Lazy><Settings /></Lazy>} />
        <Route path="*" element={<Lazy><NotFound /></Lazy>} />
      </Route>
    </Routes>
  );
}

export default App;