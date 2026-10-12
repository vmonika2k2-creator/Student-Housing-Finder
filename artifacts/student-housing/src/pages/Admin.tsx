import { useEffect, useState, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { Form } from '@/components/ui/form';
import {
  getGetHousingAdminAgentSettingsQueryKey,
  getGetHousingAdminSessionQueryKey,
  useGetHousingAdminAgentSettings,
  useGetHousingAdminSession,
  useLoginHousingAdmin,
  useLogoutHousingAdmin,
  useUpdateHousingAdminAgentSettings,
} from '@workspace/api-client-react';
import type { StudentHousingAgentSettingsInput } from '@workspace/api-client-react';
import { ArrowLeft, ArrowRight, Check, Compass, KeyRound, LoaderCircle, LockKeyhole, LogOut, RotateCcw, Save, ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Link } from 'wouter';
import './admin.css';

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function AdminLogin({ onLogin }: { onLogin: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password.trim()) {
      setError('Enter the admin password to continue.');
      return;
    }
    setError('');
    setPending(true);
    try {
      await onLogin(password);
      setPassword('');
    } catch {
      setError('That password was not accepted. Check it and try again.');
      setPassword('');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="admin-login-wrap">
      <section className="admin-login-card arrive" aria-labelledby="login-title" data-testid="panel-admin-login">
        <div className="admin-login-emblem"><KeyRound size={20} /></div>
        <p className="admin-eyebrow">ROOM.FOR · PRIVATE WORKSPACE</p>
        <h1 id="login-title">A little behind<br />the <em>conversation.</em></h1>
        <p className="admin-login-intro">Sign in to shape how the room.for guide helps students weigh their next move.</p>
        <form className="admin-login-form" onSubmit={submit} noValidate>
          <label htmlFor="admin-password">Admin password</label>
          <div className="admin-password-wrap">
            <LockKeyhole size={17} aria-hidden="true" />
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? 'login-error' : 'login-help'}
              placeholder="Enter your password"
              data-testid="input-admin-password"
              disabled={pending}
            />
          </div>
          {error ? <p className="admin-form-error" id="login-error" role="alert" data-testid="status-admin-login-error">{error}</p> : <p className="admin-field-help" id="login-help">Your password stays private and is never saved in this browser.</p>}
          <button type="submit" className="admin-primary-button admin-login-submit" disabled={pending} data-testid="button-admin-login">
            {pending ? <><LoaderCircle className="admin-spin" size={16} /> Checking access</> : <>Continue to settings <ArrowRight size={16} /></>}
          </button>
        </form>
        <div className="admin-login-foot"><ShieldCheck size={15} /><span>Session protected by room.for</span></div>
        <Link className="admin-login-back" href="/" data-testid="link-login-back-home"><ArrowLeft size={14} /> Return to student finder</Link>
      </section>
      <aside className="admin-login-aside" aria-label="About the guide">
        <span className="aside-index">A GUIDE, NOT A DECISION-MAKER</span>
        <div className="aside-quote-mark">“</div>
        <blockquote>Good advice starts by listening to what matters to you.</blockquote>
        <p>Set the guide’s point of view, its warmth, and how readily it helps a student move from options to a next step.</p>
        <div className="aside-rule"><span /><span /><span /></div>
        <span className="aside-caption">ROOM.FOR · STUDENT HOUSING, LESS GUESSWORK</span>
      </aside>
    </main>
  );
}

function ScaleField({
  id,
  label,
  description,
  value,
  onChange,
  low,
  high,
  testId,
}: {
  id: string;
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
  low: string;
  high: string;
  testId: string;
}) {
  return (
    <section className="scale-card" aria-labelledby={`${id}-label`} data-testid={`panel-${id}`}>
      <div className="scale-heading">
        <div>
          <h3 id={`${id}-label`}>{label}</h3>
          <p>{description}</p>
        </div>
        <output className="scale-value" htmlFor={id} aria-live="polite" data-testid={`value-${id}`}>{value}<span>/10</span></output>
      </div>
      <input
        id={id}
        className="admin-range"
        type="range"
        min="0"
        max="10"
        step="1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        aria-valuetext={`${value} out of 10`}
        data-testid={testId}
      />
      <div className="scale-endpoints"><span>{low}</span><span>{high}</span></div>
      <div className="scale-ticks" aria-hidden="true">{Array.from({ length: 11 }, (_, index) => <span key={index} className={index <= value ? 'filled' : ''} />)}</div>
    </section>
  );
}

function SettingsEditor({
  onLogout,
  logoutPending,
  logoutError,
}: {
  onLogout: () => void;
  logoutPending: boolean;
  logoutError: string;
}) {
  const queryClient = useQueryClient();
  const settings = useGetHousingAdminAgentSettings({
    query: {
      enabled: true,
      queryKey: getGetHousingAdminAgentSettingsQueryKey(),
      retry: false,
    },
  });
  const update = useUpdateHousingAdminAgentSettings();
  const form = useForm<StudentHousingAgentSettingsInput>({
    defaultValues: { persona: '', tone: '', empathyScale: 5, goalOrientationScale: 5 },
    mode: 'onChange',
  });
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (settings.data) {
      form.reset({
        persona: settings.data.persona,
        tone: settings.data.tone,
        empathyScale: settings.data.empathyScale,
        goalOrientationScale: settings.data.goalOrientationScale,
      });
    }
  }, [settings.data, form]);

  async function save(values: StudentHousingAgentSettingsInput) {
    setSaveError('');
    try {
      const saved = await update.mutateAsync({ data: values });
      form.reset({
        persona: saved.persona,
        tone: saved.tone,
        empathyScale: saved.empathyScale,
        goalOrientationScale: saved.goalOrientationScale,
      });
      queryClient.setQueryData(getGetHousingAdminAgentSettingsQueryKey(), saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetHousingAdminAgentSettingsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetHousingAdminSessionQueryKey() }),
      ]);
    } catch (error) {
      setSaveError(errorMessage(error, 'Your changes could not be saved. Please try again.'));
    }
  }

  const { register, watch, setValue, handleSubmit, formState: { isDirty, errors } } = form;
  const empathy = watch('empathyScale');
  const goalOrientation = watch('goalOrientationScale');

  return (
    <div className="admin-settings-page">
      <header className="admin-topbar">
        <Link href="/" className="brand admin-brand" data-testid="link-admin-home">
          <span className="brand-symbol"><Compass size={18} strokeWidth={2.2} /></span>
          <span>room<span className="brand-dot">.</span>for<small>student housing, less guesswork</small></span>
        </Link>
        <div className="admin-topbar-actions">
          <span className="admin-session-badge"><span /> Admin workspace</span>
          <button type="button" className="admin-logout-button" onClick={onLogout} disabled={logoutPending} data-testid="button-admin-logout">{logoutPending ? <LoaderCircle className="admin-spin" size={15} /> : <LogOut size={15} />} {logoutPending ? 'Signing out' : 'Sign out'}</button>
        </div>
      </header>
      {logoutError && <div className="admin-logout-error" role="alert" data-testid="status-admin-logout-error">{logoutError}</div>}

      <main className="admin-main">
        <div className="admin-breadcrumb"><Link href="/" data-testid="link-admin-back-home"><ArrowLeft size={14} /> Back to student finder</Link><span>/</span><span>Guide settings</span></div>
        <section className="admin-page-heading arrive">
          <div>
            <p className="admin-eyebrow"><SlidersHorizontal size={13} /> GUIDE BEHAVIOR</p>
            <h1>Set the tone<br /><em>for good guidance.</em></h1>
            <p className="admin-heading-description">Tune how the room.for guide shows up when a student is comparing places, priorities, and possibilities.</p>
          </div>
          <div className="admin-heading-stamp"><span className="stamp-icon"><Sparkles size={18} /></span><span>Student-first<br />by design</span></div>
        </section>

        {settings.isLoading && <div className="admin-loading-card" aria-label="Loading guide settings" data-testid="status-admin-settings-loading"><div className="admin-skeleton skeleton-heading" /><div className="admin-skeleton skeleton-copy" /><div className="admin-skeleton skeleton-copy short" /><div className="admin-skeleton skeleton-panel" /><div className="admin-skeleton skeleton-panel" /></div>}
        {settings.isError && <section className="admin-error-card" role="alert" data-testid="status-admin-settings-error"><div className="error-mark"><RotateCcw size={18} /></div><h2>Settings didn’t come through.</h2><p>We couldn’t load the guide configuration. Your current work hasn’t been changed.</p><button type="button" className="admin-secondary-button" onClick={() => void settings.refetch()} data-testid="button-retry-admin-settings">Try loading again <ArrowRight size={15} /></button></section>}

        {!settings.isLoading && !settings.isError && settings.data && (
          <Form {...form}>
          <form className="admin-editor" onSubmit={handleSubmit(save)} data-testid="form-admin-settings">
            <div className="editor-main-column">
              <section className="editor-section" aria-labelledby="persona-title">
                <div className="section-number">01</div>
                <div className="section-body">
                  <div className="editor-section-heading"><div><p className="admin-eyebrow">THE GUIDE’S POINT OF VIEW</p><h2 id="persona-title">Persona</h2></div><span className="section-note">Who is speaking?</span></div>
                  <p className="editor-intro">Describe the guide’s role and the principles it should bring to every housing conversation.</p>
                  <label className="admin-label" htmlFor="persona">Persona instructions</label>
                  <textarea
                    id="persona"
                    rows={5}
                    maxLength={1000}
                    placeholder="For example: You are a thoughtful housing guide for students moving to a new city..."
                    {...register('persona', { required: 'Add a persona before saving.', maxLength: { value: 1000, message: 'Keep the persona under 1,000 characters.' } })}
                    aria-invalid={!!errors.persona}
                    aria-describedby="persona-help persona-count"
                    data-testid="textarea-admin-persona"
                  />
                  <div className="field-meta"><span id="persona-help">Keep the guidance grounded, useful, and student-first.</span><span id="persona-count" data-testid="text-persona-character-count">{watch('persona').length}/1,000</span></div>
                  {errors.persona && <p className="admin-form-error" role="alert" data-testid="status-persona-error">{errors.persona.message}</p>}
                </div>
              </section>

              <section className="editor-section" aria-labelledby="tone-title">
                <div className="section-number">02</div>
                <div className="section-body">
                  <div className="editor-section-heading"><div><p className="admin-eyebrow">HOW IT SOUNDS</p><h2 id="tone-title">Tone</h2></div><span className="section-note">What does it feel like?</span></div>
                  <p className="editor-intro">Set the language style students should hear: clear, warm, and never pushy.</p>
                  <label className="admin-label" htmlFor="tone">Tone instructions</label>
                  <textarea
                    id="tone"
                    rows={3}
                    maxLength={300}
                    placeholder="For example: Warm, plain-spoken, and calm. Explain trade-offs without pressure."
                    {...register('tone', { required: 'Add tone guidance before saving.', maxLength: { value: 300, message: 'Keep tone guidance under 300 characters.' } })}
                    aria-invalid={!!errors.tone}
                    aria-describedby="tone-help tone-count"
                    data-testid="textarea-admin-tone"
                  />
                  <div className="field-meta"><span id="tone-help">Short direction is often the most effective.</span><span id="tone-count" data-testid="text-tone-character-count">{watch('tone').length}/300</span></div>
                  {errors.tone && <p className="admin-form-error" role="alert" data-testid="status-tone-error">{errors.tone.message}</p>}
                </div>
              </section>

              <section className="editor-section scales-section" aria-labelledby="scales-title">
                <div className="section-number">03</div>
                <div className="section-body">
                  <div className="editor-section-heading"><div><p className="admin-eyebrow">CONVERSATION BALANCE</p><h2 id="scales-title">Response style</h2></div><span className="section-note">Fine-tune the guide</span></div>
                  <p className="editor-intro">Choose how much the guide leans into emotional support and practical next steps.</p>
                  <ScaleField id="empathy-scale" label="Empathy" description="How much should it acknowledge feelings and uncertainty?" value={empathy} onChange={(value) => setValue('empathyScale', value, { shouldDirty: true, shouldValidate: true })} low="Direct & factual" high="Highly empathetic" testId="range-admin-empathy" />
                  <ScaleField id="goal-orientation-scale" label="Goal orientation" description="How readily should it help a student turn reflection into action?" value={goalOrientation} onChange={(value) => setValue('goalOrientationScale', value, { shouldDirty: true, shouldValidate: true })} low="Passive & exploratory" high="Goal-oriented" testId="range-admin-goal-orientation" />
                </div>
              </section>
            </div>

            <aside className="admin-save-rail">
              <div className="save-rail-card">
                <div className="save-rail-icon"><Check size={17} /></div>
                <p className="admin-eyebrow">YOUR SETTINGS</p>
                <h2>Shape the next conversation.</h2>
                <p>These choices guide how the assistant helps students compare their options.</p>
                {settings.data.updatedAt && <div className="updated-line"><span>Last saved</span><time dateTime={settings.data.updatedAt} data-testid="text-admin-settings-updated">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(settings.data.updatedAt))}</time></div>}
                <button type="submit" className="admin-primary-button save-button" disabled={update.isPending || (!isDirty && !saveError)} data-testid="button-save-admin-settings">
                  {update.isPending ? <><LoaderCircle className="admin-spin" size={16} /> Saving changes</> : <><Save size={16} /> Save settings</>}
                </button>
                {isDirty && !update.isPending && <p className="unsaved-note" data-testid="status-admin-unsaved">Unsaved changes</p>}
                {saveError && <p className="admin-form-error save-error" role="alert" data-testid="status-admin-save-error">{saveError}</p>}
                {update.isSuccess && !isDirty && !saveError && <p className="save-success" role="status" data-testid="status-admin-save-success"><Check size={14} /> Settings saved</p>}
              </div>
              <div className="student-note"><span className="student-note-icon"><Sparkles size={15} /></span><p><strong>Keep the student in the lead.</strong> The guide can help someone think clearly without deciding for them.</p></div>
            </aside>
          </form>
          </Form>
        )}
      </main>
      <footer className="admin-footer"><span>room<span className="brand-dot">.</span>for</span><span>Practical guidance for the move ahead.</span></footer>
    </div>
  );
}

export default function Admin() {
  const queryClient = useQueryClient();
  const [logoutError, setLogoutError] = useState('');
  const session = useGetHousingAdminSession({
    query: { queryKey: getGetHousingAdminSessionQueryKey(), retry: false },
  });
  const login = useLoginHousingAdmin();
  const logout = useLogoutHousingAdmin();

  async function authenticate(password: string) {
    const result = await login.mutateAsync({ data: { password } });
    if (!result.authenticated) throw new Error('Authentication was not accepted.');
    await queryClient.invalidateQueries({ queryKey: getGetHousingAdminSessionQueryKey() });
    await queryClient.refetchQueries({ queryKey: getGetHousingAdminSessionQueryKey(), exact: true });
    await queryClient.invalidateQueries({ queryKey: getGetHousingAdminAgentSettingsQueryKey() });
  }

  async function signOut() {
    setLogoutError('');
    try {
      await logout.mutateAsync();
    } catch {
      setLogoutError('Sign out did not complete. Please try again.');
    } finally {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetHousingAdminSessionQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetHousingAdminAgentSettingsQueryKey() }),
      ]);
      await queryClient.refetchQueries({ queryKey: getGetHousingAdminSessionQueryKey(), exact: true });
    }
  }

  return (
    <div className="admin-shell">
      {session.isLoading && <main className="admin-auth-loading" aria-label="Checking admin session" data-testid="status-admin-session-loading"><div className="session-skeleton"><span /><span /><span /></div></main>}
      {session.isError && <main className="admin-session-error" role="alert" data-testid="status-admin-session-error"><div className="admin-login-emblem"><RotateCcw size={19} /></div><h1>We can’t check access right now.</h1><p>Please retry the session check. No settings have been changed.</p><button type="button" className="admin-primary-button" onClick={() => void session.refetch()} data-testid="button-retry-admin-session">Try again <ArrowRight size={15} /></button><Link href="/" data-testid="link-session-error-home"><ArrowLeft size={14} /> Return to student finder</Link></main>}
      {!session.isLoading && !session.isError && !session.data?.authenticated && <AdminLogin onLogin={authenticate} />}
      {!session.isLoading && !session.isError && session.data?.authenticated && <SettingsEditor onLogout={() => void signOut()} logoutPending={logout.isPending} logoutError={logoutError} />}
    </div>
  );
}
