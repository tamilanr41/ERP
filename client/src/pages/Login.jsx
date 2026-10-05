import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  Activity,
  ShieldCheck,
  Share2,
  TrendingUp,
  Users,
  Eye,
  EyeOff,
  ArrowRight,
  Lock,
  User,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiError } from '../lib/api';
import { Spinner } from '../components/ui/Feedback';

const PILLARS = [
  { icon: Users, title: 'Patient Care', sub: 'Better outcomes' },
  { icon: Share2, title: 'Operational Efficiency', sub: 'Higher productivity' },
  { icon: ShieldCheck, title: 'Data Security', sub: 'Complete privacy' },
  { icon: TrendingUp, title: 'Growth Ready', sub: 'Scalable platform' },
];

const STATS = [
  { value: '500+', label: 'Beds' },
  { value: '50+', label: 'Departments' },
  { value: '200+', label: 'Medical Staff' },
  { value: '24/7', label: 'Care & Support' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ defaultValues: { usernameOrEmail: '', password: '', remember: false } });
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      const user = await login(values);
      toast.success(`Welcome back, ${user.firstName}`);
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = (e) => {
    e.preventDefault();
    toast.message('Contact your system administrator to reset your password.');
  };

  const handleSso = () => {
    toast.message('SSO login is not configured for this workspace yet.');
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#050b16] font-sans text-white">
      {/* ---------------- background photo + overlay (fixed, full bleed) ---------------- */}
      <img
        aria-hidden="true"
        alt=""
        src="/uploads/bg_img.png"
        className="fixed inset-0 z-0 h-full w-full object-cover"
      />
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 90% 60% at 15% 0%, rgba(51,182,255,0.04), transparent 60%),' +
            'radial-gradient(ellipse 70% 50% at 85% 100%, rgba(51,182,255,0.04), transparent 60%),' +
            'linear-gradient(100deg, rgba(4,10,20,0.45) 0%, rgba(4,10,20,0.22) 34%, rgba(4,10,20,0.05) 60%, rgba(4,10,20,0) 100%),' +
            'linear-gradient(180deg, rgba(3,8,16,0.25) 0%, rgba(3,8,16,0) 30%, rgba(3,8,16,0) 65%, rgba(3,8,16,0.35) 100%)',
        }}
      />

      {/* ---------------- top bar ---------------- */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-7 sm:px-10 lg:px-16">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-gradient-to-br from-sky-300 to-sky-600 shadow-[0_0_22px_rgba(51,182,255,0.45)]">
            <Activity className="h-5 w-5 text-[#04121f]" strokeWidth={2.4} />
          </div>
          <div>
            <div className="text-lg font-bold leading-tight tracking-tight">
              ZhanX <span className="text-sky-300">HospitalOS</span>
            </div>
            <div className="text-[10px] font-medium tracking-[3px] text-slate-400">CLINICAL COMMAND</div>
          </div>
        </div>
        <div className="hidden items-center gap-3.5 text-sm text-slate-300 sm:flex">
          <span>Better Systems</span>
          <span className="h-[3px] w-[3px] rounded-full bg-slate-500" />
          <span>Healthier Tomorrow</span>
        </div>
      </div>

      {/* ---------------- main stage ---------------- */}
      <div className="relative z-10 mx-auto grid max-w-[1360px] grid-cols-1 items-center gap-10 px-6 py-12 sm:px-10 lg:grid-cols-[1.25fr_0.85fr] lg:gap-12 lg:px-16 lg:py-16">
        {/* ---------- left: hero ---------- */}
        <div>
          <div className="mb-4 text-xs font-semibold tracking-[3px] text-sky-300">HOSPITAL MANAGEMENT SYSTEM</div>
          <h1 className="max-w-xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
            Unified Care.
            <br />
            <span className="bg-gradient-to-r from-sky-300 to-sky-400 bg-clip-text text-transparent">
              Smarter Operations.
            </span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-slate-300">
            ZhanX HospitalOS brings every ward, department and record under one secure, intelligent platform — built
            for the pace of real clinical work.
          </p>

          <div className="mt-11 flex flex-wrap gap-8">
            {PILLARS.map(({ icon: Icon, title, sub }) => (
              <div key={title} className="flex max-w-[160px] items-center gap-3">
                <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full border border-sky-300/25 bg-sky-400/[0.07]">
                  <Icon className="h-[19px] w-[19px] text-sky-300" strokeWidth={1.8} />
                </div>
                <div>
                  <div className="text-sm font-bold leading-tight">{title}</div>
                  <div className="mt-0.5 text-xs text-slate-400">{sub}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-9 grid grid-cols-2 divide-y divide-sky-300/20 overflow-hidden rounded-[14px] border border-sky-300/20 bg-white/5 backdrop-blur-xl sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            {STATS.map((s) => (
              <div key={s.label} className="px-4 py-4">
                <div className="font-mono text-xl font-bold text-sky-300">{s.value}</div>
                <div className="text-[11px] text-slate-400">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-7 flex items-center gap-2.5 text-sm text-slate-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            System Online
          </div>
        </div>

        {/* ---------- right: glass login card ---------- */}
        <div className="relative rounded-[20px] border border-sky-300/25 bg-[#0e1c30]/55 p-7 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.6)] backdrop-blur-2xl sm:p-9">
          <h2 className="text-[28px] font-bold tracking-tight">Welcome Back</h2>
          <p className="mb-7 mt-2 text-sm text-slate-300">Sign in to your ZhanX HospitalOS account</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-[18px]" noValidate>
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-300">
                Username / Email / Employee ID
              </label>
              <div className="flex items-center rounded-[11px] border border-sky-300/25 bg-[#050e1a]/45 transition-colors focus-within:border-sky-400 focus-within:ring-[3px] focus-within:ring-sky-400/20">
                <User className="ml-3 h-[17px] w-[17px] shrink-0 text-slate-400" strokeWidth={1.8} />
                <input
                  className="w-full flex-1 bg-transparent px-2 py-[13px] text-[15px] text-white placeholder:text-slate-500 focus:outline-none"
                  type="text"
                  autoComplete="username"
                  placeholder="Enter your username or email"
                  {...register('usernameOrEmail', { required: 'Enter your username, email or employee ID' })}
                />
              </div>
              {errors.usernameOrEmail && (
                <p className="mt-1.5 text-xs text-red-400">{errors.usernameOrEmail.message}</p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-300">Password</label>
              <div className="flex items-center rounded-[11px] border border-sky-300/25 bg-[#050e1a]/45 transition-colors focus-within:border-sky-400 focus-within:ring-[3px] focus-within:ring-sky-400/20">
                <Lock className="ml-3 h-[17px] w-[17px] shrink-0 text-slate-400" strokeWidth={1.8} />
                <input
                  className="w-full flex-1 bg-transparent px-2 py-[13px] text-[15px] text-white placeholder:text-slate-500 focus:outline-none"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  {...register('password', { required: 'Enter your password' })}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                  className="mr-2.5 flex items-center p-1 text-slate-400 hover:text-sky-300"
                >
                  {showPwd ? <EyeOff className="h-[17px] w-[17px]" strokeWidth={1.8} /> : <Eye className="h-[17px] w-[17px]" strokeWidth={1.8} />}
                </button>
              </div>
              {errors.password && <p className="mt-1.5 text-xs text-red-400">{errors.password.message}</p>}
            </div>

            <div className="flex items-center justify-between pt-1 text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  className="h-[15px] w-[15px] cursor-pointer rounded border-sky-300/40 bg-transparent text-sky-400 focus:ring-sky-400"
                  {...register('remember')}
                />
                Remember me
              </label>
              <button
                type="button"
                onClick={handleForgotPassword}
                className="font-medium text-sky-300 hover:underline"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-[11px] bg-gradient-to-r from-sky-600 via-sky-400 to-sky-300 py-[14.5px] text-[15px] font-bold text-[#04121f] shadow-[0_12px_28px_-10px_rgba(51,182,255,0.55)] transition-transform hover:brightness-[1.06] active:translate-y-0 disabled:opacity-60"
            >
              {submitting ? (
                <Spinner className="h-4 w-4 text-[#04121f]" />
              ) : (
                <>
                  Sign In <ArrowRight className="h-[17px] w-[17px]" strokeWidth={2.2} />
                </>
              )}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3.5 text-xs text-slate-400">
            <div className="h-px flex-1 bg-sky-300/20" />
            or
            <div className="h-px flex-1 bg-sky-300/20" />
          </div>

          <button
            type="button"
            onClick={handleSso}
            className="flex w-full items-center justify-center gap-2 rounded-[11px] border border-sky-300/25 bg-white/[0.02] py-[13px] text-sm font-semibold text-white transition-colors hover:border-sky-500 hover:bg-sky-400/[0.08]"
          >
            <KeyRound className="h-4 w-4 text-sky-300" strokeWidth={1.8} />
            Login with SSO
          </button>

          <div className="mt-[22px] flex items-start gap-3 rounded-xl border border-sky-400/20 bg-sky-400/[0.06] p-4">
            <ShieldCheck className="mt-0.5 h-[19px] w-[19px] shrink-0 text-sky-300" strokeWidth={1.8} />
            <div>
              <div className="text-sm font-semibold text-white">Secure Login</div>
              <div className="mt-0.5 text-xs leading-relaxed text-slate-400">
                Your data is protected with enterprise-grade security.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}