import { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, FlaskConical, Pill, Settings2, Users as UsersIcon } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState } from '../../components/ui/Feedback';
import { MotionTab } from '../../components/ui/Motion';
import { cn } from '../../lib/utils';

const HospitalSettings = lazy(() => import('./HospitalSettings'));
const UserSettings = lazy(() => import('./UserSettings'));
const MedicineSettings = lazy(() => import('./MedicineSettings'));
const LabTestSettings = lazy(() => import('./LabTestSettings'));
const GeneralSettings = lazy(() => import('./GeneralSettings'));

/**
 * Every tab here is master data an administrator owns and edits in place. The
 * active tab lives in ?tab= so the Administration module's tiles can deep link
 * straight into one of them, the same convention ModuleLanding uses.
 */
const TABS = [
  { key: 'hospital', label: 'Hospital', icon: Building2, component: HospitalSettings },
  { key: 'users', label: 'Users', icon: UsersIcon, component: UserSettings },
  { key: 'medicines', label: 'Medicines', icon: Pill, component: MedicineSettings },
  { key: 'lab-tests', label: 'Test names', icon: FlaskConical, component: LabTestSettings },
  { key: 'general', label: 'Configuration', icon: Settings2, component: GeneralSettings },
];

export default function SettingsWorkspace() {
  const [params, setParams] = useSearchParams();
  const active = TABS.find((t) => t.key === params.get('tab')) || TABS[0];
  const Body = active.component;

  return (
    <div className="p-6">
      <PageHeader
        title="System Settings"
        subtitle="Hospital identity, staff accounts, the pharmacy catalogue and the lab test list."
      />

      <div className="mb-4 flex flex-wrap gap-1 border-b border-ink-200">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition',
              key === active.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-800',
            )}
            aria-current={key === active.key ? 'page' : undefined}
            onClick={() => setParams({ tab: key }, { replace: true })}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      <MotionTab tabKey={active.key}>
        <Suspense fallback={<LoadingState />}>
          <Body />
        </Suspense>
      </MotionTab>
    </div>
  );
}