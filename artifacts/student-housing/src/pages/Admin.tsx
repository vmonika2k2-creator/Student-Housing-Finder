import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
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
import { ArrowLeft, ArrowRight, Check, Compass, KeyRound, LoaderCircle, LockKeyhole, LogOut, RotateCcw, Save, ShieldCheck, SlidersHorizontal, Sparkles, Plus, Trash2, Pencil, MessageSquareText, RefreshCw } from 'lucide-react';
import { Link } from 'wouter';
import './admin.css';

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

type ConversationSummary = { id: string; studentName: string; startedAt: string; lastActiveAt: string; messageCount: number; lastMessage: string; status: string; feedback: string | null };
type ConversationDetail = ConversationSummary & { messages: { role: 'user' | 'assistant'; content: string }[] };

function ConversationAnalytics() {
  const [rows, setRows] = useState<ConversationSummary[]>([]);
  const [selected, setSelected] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  async function loadRows() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/housing/admin/conversations', { credentials: 'include' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Conversation history could not be loaded.');
      setRows(result.conversations ?? []);
    } catch (cause) { setError(errorMessage(cause, 'Conversation history could not be loaded.')); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadRows(); }, []);

  async function viewConversation(id: string) {
    setError('');
    try {
      const response = await fetch(`/api/housing/admin/conversations/${encodeURIComponent(id)}`, { credentials: 'include' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Conversation details could not be loaded.');
      setSelected(result);
    } catch (cause) { setError(errorMessage(cause, 'Conversation details could not be loaded.')); }
  }

  const visibleRows = rows.filter((row) => `${row.studentName} ${row.lastMessage} ${row.status} ${row.feedback ?? ''}`.toLowerCase().includes(filter.toLowerCase()));
  const endedCount = rows.filter((row) => row.status === 'Ended').length;
  const ratedCount = rows.filter((row) => row.feedback).length;
  const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

  return <section className="conversation-analytics" aria-labelledby="conversation-analytics-title">
    <div className="conversation-analytics-heading"><div><p className="admin-eyebrow"><MessageSquareText size={13} /> STUDENT CONVERSATIONS</p><h2 id="conversation-analytics-title">Chat activity</h2><p>Review recent conversations and student feedback to understand what is helping.</p></div><button type="button" className="admin-secondary-button" onClick={() => void loadRows()} disabled={loading}><RefreshCw size={14} /> Refresh</button></div>
    <div className="conversation-stats"><div><strong>{rows.length}</strong><span>Recent chats</span></div><div><strong>{endedCount}</strong><span>Ended</span></div><div><strong>{ratedCount}</strong><span>Feedback received</span></div></div>
    {error && <p className="admin-form-error" role="alert">{error}</p>}
    {selected && <div className="conversation-detail"><div className="conversation-detail-heading"><div><strong>{selected.studentName}</strong><span>{formatDate(selected.startedAt)} · {selected.messages.length} messages{selected.feedback ? ` · ${selected.feedback}` : ''}</span></div><button type="button" className="admin-secondary-button" onClick={() => setSelected(null)}>Close chat</button></div><div className="conversation-transcript">{selected.messages.map((message, index) => <div className={`transcript-message ${message.role}`} key={`${index}-${message.role}`}><strong>{message.role === 'user' ? selected.studentName : 'Guide'}</strong><p>{message.content}</p></div>)}</div></div>}
    <label className="conversation-search">Filter chats<input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Name, message, status, feedback" /></label>
    <div className="conversation-table-scroll"><table className="conversation-table"><thead><tr><th>Student</th><th>Started</th><th>Messages</th><th>Last message</th><th>Status</th><th>Feedback</th><th></th></tr></thead><tbody>{loading ? <tr><td colSpan={7}>Loading conversations…</td></tr> : visibleRows.length === 0 ? <tr><td colSpan={7}>No conversations match this filter yet.</td></tr> : visibleRows.map((row) => <tr key={row.id}><td>{row.studentName}</td><td>{formatDate(row.startedAt)}</td><td>{row.messageCount}</td><td>{row.lastMessage || '—'}</td><td><span className={`conversation-status ${row.status.toLowerCase().replace(/\s+/g, '-')}`}>{row.status}</span></td><td>{row.feedback ?? 'Not rated'}</td><td><button type="button" className="conversation-view-button" onClick={() => void viewConversation(row.id)}>View chat</button></td></tr>)}</tbody></table></div>
    <p className="conversation-privacy-note">Chat content includes the name and messages students shared. Use this view for service analysis and keep access limited to admins.</p>
  </section>;
}

const EMPATHY_STAGES = [
  { label: 'Matter-of-fact', range: '0–1', min: 0, max: 1 },
  { label: 'Polite', range: '2–3', min: 2, max: 3 },
  { label: 'Considerate', range: '4–6', min: 4, max: 6 },
  { label: 'Warm', range: '7–8', min: 7, max: 8 },
  { label: 'Deeply empathetic', range: '9–10', min: 9, max: 10 },
];
const EMPATHY_EXAMPLE_PLACEHOLDERS = [
  'Example: a short, factual reply with no comment on feelings.',
  'Example: a brief, courteous acknowledgement, then the facts.',
  'Example: a sentence of understanding, then practical help.',
  'Example: a warm reply that names the feeling before giving advice.',
  'Example: a reply that fully recognizes the feeling and reassures before helping.',
];

const DEFAULT_SETTINGS: StudentHousingAgentSettingsInput = {
  persona: 'You are Dormo, a student-first housing guide for Indian UG and PG students. Help students find and compare flats, PGs, hostels, shared rooms, and nearby daily-life services with clarity and confidence. Understand safety, food, commute, privacy, budget, and convenience matter. Keep the student in control and help them think clearly; do not decide for them.',
  environment: 'Create a calm, welcoming, home-like conversation. Be warm and reassuring without being overly familiar. Keep a steady, unhurried pace, use plain language, and make each exchange feel like a helpful conversation rather than a form. Give the student room to think and choose.',
  rentalSearchProvider: 'squareyards',
  tone: 'Clear, warm, calm, respectful, and student-friendly. Use short sentences and simple words. Be considerate, never pushy, salesy, or overly emotional. Acknowledge uncertainty, budget pressure, safety concerns, and frustration briefly, then move to a useful next step.',
  empathyScale: 5,
  goalOrientationScale: 5,
  empathyExamples: [
    'Student: "I\'m so stressed about finding a place."\nGuide: "Understood. Here are two options within your budget, with rent and travel time for each."',
    'Student: "I\'m so stressed about finding a place."\nGuide: "Moving is stressful. Here are two options that fit your budget and travel time."',
    'Student: "I\'m so stressed about finding a place."\nGuide: "That\'s a lot to juggle, and feeling unsure is normal. Let\'s start with your budget and how far you\'re happy to travel."',
    'Student: "I\'m so stressed about finding a place."\nGuide: "That sounds really stressful, and I\'m sorry it\'s weighing on you. Let\'s take it one step at a time, starting with what matters most to you."',
    'Student: "I\'m so stressed about finding a place."\nGuide: "I can hear how overwhelming this feels, and it makes complete sense to be anxious about a move like this. You\'re not behind. We\'ll go at your pace, and I\'ll help you feel sure about each choice."',
  ],
  goal: 'Help the student narrow down to two or three homes they would be happy to visit.',
  conversationBehavior: 'Have a natural back-and-forth, not an intake interview. Answer the student\'s latest question first, acknowledge new details, and remember facts already shared. Ask at most one question, only when its answer would materially change the recommendation or action. Treat intake order as a guide, not a checklist; do not ask a new intake question after every response. Give useful partial help and proceed with search once there is enough information. After results, answer questions and explain trade-offs before suggesting one next step.',
  guardrails: 'Never promise absolute safety or guaranteed refunds. Use verified facts only. Do not discriminate by protected characteristics. Do not invent availability, distances, amenities or rules. Do not ask for sensitive personal information. Get permission before sharing contact details.',
  handoverRules: 'Offer a human immediately when requested. Confirm before contacting an owner or sharing personal details. For confusion, simplify once then offer a human. For frustration or safety concerns, acknowledge and offer human support.',
  knowledgeRules: 'Use supplied property data only. State when information is missing or uncertain. Never invent nearby services, distances, menus, availability, safety arrangements or policies.',
  ctaSettings: 'Offer one relevant next step: view details, compare properties, schedule a visit, request owner callback, show a nearby map, save a shortlist, or talk to a human.',
  feedbackSettings: 'After fulfilling the request, acknowledge briefly and ask how helpful the conversation was: Very helpful, Somewhat helpful, or Not helpful.',
  integrations: [],
};

function empathyStageFor(value: number) {
  const index = EMPATHY_STAGES.findIndex((stage) => value >= stage.min && value <= stage.max);
  return index === -1 ? 2 : index;
}

function toFormValues(settings: StudentHousingAgentSettingsInput): StudentHousingAgentSettingsInput {
  return {
    persona: settings.persona,
    environment: settings.environment ?? DEFAULT_SETTINGS.environment,
    rentalSearchProvider: settings.rentalSearchProvider ?? DEFAULT_SETTINGS.rentalSearchProvider,
    tone: settings.tone,
    empathyScale: settings.empathyScale,
    goalOrientationScale: settings.goalOrientationScale,
    empathyExamples: Array.from({ length: EMPATHY_STAGES.length }, (_, index) => settings.empathyExamples[index] ?? ''),
    goal: settings.goal,
    conversationBehavior: settings.conversationBehavior ?? DEFAULT_SETTINGS.conversationBehavior,
    guardrails: settings.guardrails ?? DEFAULT_SETTINGS.guardrails,
    handoverRules: settings.handoverRules ?? DEFAULT_SETTINGS.handoverRules,
    knowledgeRules: settings.knowledgeRules ?? DEFAULT_SETTINGS.knowledgeRules,
    ctaSettings: settings.ctaSettings ?? DEFAULT_SETTINGS.ctaSettings,
    feedbackSettings: settings.feedbackSettings ?? DEFAULT_SETTINGS.feedbackSettings,
    integrations: settings.integrations ?? [],
  };
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
  children,
}: {
  id: string;
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
  low: string;
  high: string;
  testId: string;
  children?: ReactNode;
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
      {children}
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
    defaultValues: { ...DEFAULT_SETTINGS },
    mode: 'onChange',
  });
  const [saveError, setSaveError] = useState('');
  const [promptPreview, setPromptPreview] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [testMessage, setTestMessage] = useState('I need a room near my college');
  const [testReply, setTestReply] = useState('');
  const [testError, setTestError] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [integrationType, setIntegrationType] = useState<'api' | 'mcp'>('api');
  const [integrationLabel, setIntegrationLabel] = useState('');
  const [integrationUrl, setIntegrationUrl] = useState('');
  const [editingIntegrationId, setEditingIntegrationId] = useState('');
  const [apifyStatus, setApifyStatus] = useState('Not checked');
  const [apifyChecking, setApifyChecking] = useState(false);
  const [apifyConnectionConnected, setApifyConnectionConnected] = useState(false);

  useEffect(() => {
    if (settings.data) {
      form.reset(toFormValues(settings.data));
    }
  }, [settings.data, form]);

  async function save(values: StudentHousingAgentSettingsInput) {
    setSaveError('');
    try {
      const saved = await update.mutateAsync({ data: values });
      form.reset(toFormValues(saved));
      setResetNote(false);
      queryClient.setQueryData(getGetHousingAdminAgentSettingsQueryKey(), saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetHousingAdminAgentSettingsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetHousingAdminSessionQueryKey() }),
      ]);
    } catch (error) {
      setSaveError(errorMessage(error, 'Your changes could not be saved. Please try again.'));
    }
  }

  async function loadPromptPreview() {
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const response = await fetch('/api/housing/admin/agent-settings/preview', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Could not load the final system prompt.');
      const result = await response.json() as { prompt: string };
      setPromptPreview(result.prompt);
    } catch (error) {
      setPreviewError(errorMessage(error, 'Could not load the final system prompt.'));
    } finally {
      setPreviewLoading(false);
    }
  }

  async function runAgentTest() {
    setTestLoading(true);
    setTestError('');
    try {
      const response = await fetch('/api/housing/admin/agent-settings/test', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: testMessage }) });
      const result = await response.json() as { reply?: string; error?: string };
      if (!response.ok) throw new Error(result.error || 'The test conversation failed.');
      setTestReply(result.reply ?? '');
    } catch (error) {
      setTestError(errorMessage(error, 'The test conversation failed.'));
    } finally {
      setTestLoading(false);
    }
  }

  const { register, watch, setValue, handleSubmit, formState: { isDirty, errors } } = form;
  const empathy = watch('empathyScale');
  const goalOrientation = watch('goalOrientationScale');
  const empathyStage = empathyStageFor(empathy);
  const goalText = watch('goal') ?? '';
  const integrations = watch('integrations') ?? [];
  const rentalSearchProvider = watch('rentalSearchProvider');
  const [resetNote, setResetNote] = useState(false);

  async function checkApifyStatus() {
    setApifyChecking(true);
    setApifyConnectionConnected(false);
    try {
      const response = await fetch('/api/housing/admin/integrations/apify/status', { credentials: 'same-origin' });
      const result = await response.json() as { connected?: boolean; tools?: string[]; error?: string };
      const connected = response.ok && result.connected === true;
      setApifyConnectionConnected(connected);
      setApifyStatus(connected ? 'Connected · ' + (result.tools?.length ?? 0) + ' tools available' : result.error ?? 'Connection check failed.');
    } catch {
      setApifyStatus('Connection check failed.');
    } finally {
      setApifyChecking(false);
    }
  }

  function saveIntegration() {
    const label = integrationLabel.trim();
    const url = integrationUrl.trim();
    if (!label || !/^https:\/\//i.test(url)) return;
    const entry = { id: editingIntegrationId || crypto.randomUUID(), type: integrationType, label, url };
    const next = editingIntegrationId
      ? integrations.map((item) => item.id === editingIntegrationId ? entry : item)
      : [...integrations, entry];
    setValue('integrations', next, { shouldDirty: true, shouldValidate: true });
    setIntegrationLabel(''); setIntegrationUrl(''); setEditingIntegrationId('');
  }

  function resetToDefaults() {
    const options = { shouldDirty: true, shouldValidate: true } as const;
    setValue('persona', DEFAULT_SETTINGS.persona, options);
    setValue('environment', DEFAULT_SETTINGS.environment, options);
    setValue('rentalSearchProvider', DEFAULT_SETTINGS.rentalSearchProvider, options);
    setValue('tone', DEFAULT_SETTINGS.tone, options);
    setValue('empathyScale', DEFAULT_SETTINGS.empathyScale, options);
    setValue('goalOrientationScale', DEFAULT_SETTINGS.goalOrientationScale, options);
    setValue('empathyExamples', [...DEFAULT_SETTINGS.empathyExamples], options);
    setValue('goal', DEFAULT_SETTINGS.goal, options);
    setValue('conversationBehavior', DEFAULT_SETTINGS.conversationBehavior, options);
    setValue('guardrails', DEFAULT_SETTINGS.guardrails, options);
    setValue('handoverRules', DEFAULT_SETTINGS.handoverRules, options);
    setValue('knowledgeRules', DEFAULT_SETTINGS.knowledgeRules, options);
    setValue('ctaSettings', DEFAULT_SETTINGS.ctaSettings, options);
    setValue('feedbackSettings', DEFAULT_SETTINGS.feedbackSettings, options);
    setValue('integrations', [], options);
    setResetNote(true);
  }

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
        {settings.isError && <section className="admin-error-card" role="alert" data-testid="status-admin-settings-error"><div className="error-mark"><RotateCcw size={18} /></div><h2>Settings didn’t come through.</h2><p>We couldn’t load the guide configuration. Your current work hasn’t been changed.</p>{settings.error instanceof Error && settings.error.message && <p className="admin-error-detail" data-testid="text-admin-settings-error-detail">Reason: {settings.error.message}</p>}{settings.error instanceof Error && /schema.*out of date|42703|column .* does not exist/i.test(settings.error.message) && <div className="admin-schema-help" data-testid="panel-admin-schema-help"><h3>Fix this in Replit</h3><ol><li>Open your project’s <strong>Development Shell</strong>.</li><li>Run <code>pnpm --filter @workspace/db run push</code> and approve the pending schema sync.</li><li>When it finishes, select <strong>Publish</strong> to update the public app’s database schema.</li><li>Reload <code>/admin</code>.</li></ol><p>This is a schema-version mismatch, not a database-name issue. Keep Replit’s managed database connection unchanged; the sync adds the settings columns the app expects.</p></div>}<button type="button" className="admin-secondary-button" onClick={() => void settings.refetch()} data-testid="button-retry-admin-settings">Try loading again <ArrowRight size={15} /></button></section>}

        {!settings.isLoading && !settings.isError && settings.data && (
          <Form {...form}>
          <form className="admin-editor" onSubmit={handleSubmit(save)} data-testid="form-admin-settings">
            <div className="editor-main-column">
              <section className="editor-section" aria-labelledby="persona-title">
                <div className="section-number">01</div>
                <div className="section-body">
                  <div className="editor-section-heading"><div><p className="admin-eyebrow">THE GUIDE’S POINT OF VIEW</p><h2 id="persona-title">Personality</h2></div><span className="section-note">Who is speaking?</span></div>
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

              <section className="editor-section" aria-labelledby="environment-title">
                <div className="section-number">02</div>
                <div className="section-body">
                  <div className="editor-section-heading"><div><p className="admin-eyebrow">THE STUDENT’S EXPERIENCE</p><h2 id="environment-title">Environment</h2></div><span className="section-note">How should it feel?</span></div>
                  <p className="editor-intro">Set the atmosphere, warmth, pacing, and interaction style students experience. This guidance is saved and used in every conversation.</p>
                  <label className="admin-label" htmlFor="environment">Conversation environment</label>
                  <textarea id="environment" rows={4} maxLength={1000} placeholder="For example: Calm, welcoming, unhurried, and supportive. Let the student set the pace." {...register('environment', { required: 'Describe the conversation environment.', maxLength: { value: 1000, message: 'Keep environment guidance under 1,000 characters.' } })} aria-invalid={!!errors.environment} aria-describedby="environment-help environment-count" data-testid="textarea-admin-environment" />
                  <div className="field-meta"><span id="environment-help">Describe the feeling and pace, beyond the exact words the guide uses.</span><span id="environment-count" data-testid="text-environment-character-count">{watch('environment').length}/1,000</span></div>
                  {errors.environment && <p className="admin-form-error" role="alert">{errors.environment.message}</p>}
                </div>
              </section>

              <section className="editor-section" aria-labelledby="tone-title">
                <div className="section-number">03</div>
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
                <div className="section-number">04</div>
                <div className="section-body">
                  <div className="editor-section-heading"><div><p className="admin-eyebrow">CONVERSATION BALANCE</p><h2 id="scales-title">Response style</h2></div><span className="section-note">Fine-tune the guide</span></div>
                  <p className="editor-intro">Tune warmth and empathy, then choose how actively the guide works toward its goal.</p>
                  <ScaleField id="empathy-scale" label="Empathy" description="How much should it acknowledge feelings and uncertainty?" value={empathy} onChange={(value) => setValue('empathyScale', value, { shouldDirty: true, shouldValidate: true })} low="Direct & factual" high="Highly empathetic" testId="range-admin-empathy">
                    <div className="stage-list" data-testid="panel-empathy-stages">
                      <p className="stage-intro">Write an example reply for each of the five stages. The guide uses them to understand what each level of empathy sounds like, then responds at the stage your slider points to.</p>
                      {EMPATHY_STAGES.map((stage, index) => {
                        const active = index === empathyStage;
                        const example = watch(`empathyExamples.${index}`) ?? '';
                        return (
                          <div key={stage.label} className={`stage-item${active ? ' active' : ''}`} data-testid={`panel-empathy-stage-${index + 1}`}>
                            <div className="stage-head">
                              <label htmlFor={`empathy-example-${index}`}><span className="stage-num">Stage {index + 1}</span>{stage.label}</label>
                              <span className="stage-range">Scale {stage.range}{active ? ' · In use now' : ''}</span>
                            </div>
                            <textarea
                              id={`empathy-example-${index}`}
                              rows={3}
                              maxLength={400}
                              placeholder={EMPATHY_EXAMPLE_PLACEHOLDERS[index]}
                              {...register(`empathyExamples.${index}`, { maxLength: { value: 400, message: 'Keep each example under 400 characters.' } })}
                              data-testid={`textarea-admin-empathy-example-${index + 1}`}
                            />
                            <div className="field-meta"><span>{active ? 'The guide is matching this stage right now.' : 'Optional'}</span><span data-testid={`text-empathy-example-count-${index + 1}`}>{example.length}/400</span></div>
                          </div>
                        );
                      })}
                    </div>
                  </ScaleField>
                  <ScaleField id="goal-orientation-scale" label="Initiative" description="How much should the guide take the lead toward the goal below?" value={goalOrientation} onChange={(value) => setValue('goalOrientationScale', value, { shouldDirty: true, shouldValidate: true })} low="Passive & exploratory" high="Goal-oriented" testId="range-admin-goal-orientation">
                    <div className="goal-box">
                      <label className="admin-label" htmlFor="goal">Goal and desired outcome</label>
                      <textarea
                        id="goal"
                        rows={3}
                        maxLength={500}
                        placeholder="For example: Help the student narrow down to two or three homes they would be happy to visit."
                        {...register('goal', { maxLength: { value: 500, message: 'Keep the goal under 500 characters.' } })}
                        aria-describedby="goal-help goal-count"
                        data-testid="textarea-admin-goal"
                      />
                      <div className="field-meta"><span id="goal-help">Describe the purpose and useful outcome. Conversation behaviour below controls question flow and decision-making. The initiative slider sets how actively the guide works toward this goal.</span><span id="goal-count" data-testid="text-goal-character-count">{goalText.length}/500</span></div>
                    </div>
                  </ScaleField>
                </div>
              </section>
            </div>

              {([
                ['conversationBehavior', 'Conversation flow and question structure', 'Opening questions, form or intake structure, clarifications, decision behavior, and conversation sequence.'],
                ['guardrails', 'Guardrails', 'Safety, fairness, accuracy and privacy rules.'],
                ['handoverRules', 'Handover rules', 'When and how to offer owner or human support.'],
                ['knowledgeRules', 'Knowledge/data rules', 'How the guide uses listing and local information.'],
                ['ctaSettings', 'CTA settings', 'The next steps the guide may offer.'],
                ['feedbackSettings', 'Feedback settings', 'How the guide asks for feedback after helping.'],
              ] as const).map(([field, title, description], index) => (
                <section className="editor-section" aria-labelledby={`${field}-title`} key={field}>
                  <div className="section-number">{String(index + 5).padStart(2, '0')}</div>
                  <div className="section-body">
                    <div className="editor-section-heading"><div><p className="admin-eyebrow">AGENT CONFIGURATION</p><h2 id={`${field}-title`}>{title}</h2></div></div>
                    <p className="editor-intro">{description}</p>
                    <textarea id={field} rows={4} maxLength={5000} {...register(field)} aria-label={title} data-testid={`textarea-admin-${field}`} />
                  </div>
                </section>
              ))}
              <section className="editor-section" aria-labelledby="integrations-title">
                <div className="section-number">11</div>
                <div className="section-body">
                  <div className="editor-section-heading"><div><p className="admin-eyebrow">CONNECTED RESOURCES</p><h2 id="integrations-title">API and MCP links</h2></div></div>
                  <div className="live-mcp-card" data-testid="panel-india-real-estate-mcp">
                    <div className="live-mcp-heading"><div><p className="admin-eyebrow">BUILT-IN LIVE MCP</p><h3>India Real Estate MCP</h3></div><span className={`live-mcp-badge${apifyConnectionConnected ? ' connected' : ''}`} data-testid="status-india-real-estate-mcp">{apifyConnectionConnected ? 'Connected' : 'Connection not checked'}</span></div>
                    <p>Search home listings from 99acres, MagicBricks, NoBroker, and Housing.com. Results are fetched by the server and can be shown in browse and chat.</p>
                    <a href="https://apify.com/themineworks/india-real-estate-mcp" target="_blank" rel="noreferrer">View actor details</a>
                    <div className="live-mcp-controls"><button type="button" className="admin-secondary-button" onClick={() => void checkApifyStatus()} disabled={apifyChecking}>{apifyChecking ? 'Checking connection…' : 'Check live connection'}</button><span role="status" aria-live="polite">{apifyStatus}</span></div>
                    <label className="admin-label" htmlFor="rental-search-provider">Source for new rental searches</label>
                    <select id="rental-search-provider" value={rentalSearchProvider} onChange={(event) => setValue('rentalSearchProvider', event.target.value as 'squareyards' | 'apify' | 'magicbricks', { shouldDirty: true, shouldValidate: true })} data-testid="select-rental-search-provider">
                      <option value="squareyards">Square Yards</option>
                      <option value="apify">India Real Estate MCP · four portals</option>
                      <option value="magicbricks">MagicBricks scraper · Pune, 20 results</option>
                    </select>
                    <p className="live-mcp-note">Save settings to apply the selected source. The MagicBricks scraper uses the same <code>APIFY_API_TOKEN</code> in Replit Secrets and searches the requested Pune locality. Live searches may incur Apify charges.</p>
                  </div>
                  <p className="editor-intro">Other API/MCP links below are saved as team references; adding one does not connect a new service.</p>
                  <div className="integration-form">
                    <label className="admin-label" htmlFor="integration-type">Type</label>
                    <select id="integration-type" value={integrationType} onChange={(event) => setIntegrationType(event.target.value as 'api' | 'mcp')}><option value="api">API</option><option value="mcp">MCP</option></select>
                    <label className="admin-label" htmlFor="integration-label">Name</label>
                    <input id="integration-label" value={integrationLabel} onChange={(event) => setIntegrationLabel(event.target.value)} maxLength={100} placeholder="Housing listings API" />
                    <label className="admin-label" htmlFor="integration-url">Link (HTTPS)</label>
                    <input id="integration-url" type="url" value={integrationUrl} onChange={(event) => setIntegrationUrl(event.target.value)} maxLength={1000} placeholder="https://…" />
                    <button type="button" className="admin-secondary-button" onClick={saveIntegration} disabled={!integrationLabel.trim() || !/^https:\/\//i.test(integrationUrl.trim())}><Plus size={14} /> {editingIntegrationId ? 'Update link' : 'Add link'}</button>
                    {editingIntegrationId && <button type="button" className="admin-secondary-button" onClick={() => { setEditingIntegrationId(''); setIntegrationLabel(''); setIntegrationUrl(''); }}>Cancel edit</button>}
                  </div>
                  <ul className="integration-list">{integrations.map((item) => <li key={item.id}>
                    <span><strong>{item.type.toUpperCase()} · {item.label}</strong><a href={item.url} target="_blank" rel="noreferrer">{item.url}</a></span>
                    <button type="button" className="admin-secondary-button" aria-label={`Edit ${item.label}`} onClick={() => { setEditingIntegrationId(item.id); setIntegrationType(item.type); setIntegrationLabel(item.label); setIntegrationUrl(item.url); }}><Pencil size={14} /> Edit</button>
                    <button type="button" className="admin-secondary-button" aria-label={`Delete ${item.label}`} onClick={() => setValue('integrations', integrations.filter((entry) => entry.id !== item.id), { shouldDirty: true })}><Trash2 size={14} /> Delete</button>
                  </li>)}</ul>
                </div>
              </section>

            <aside className="admin-save-rail">
              <div className="save-rail-card">
                <div className="save-rail-icon"><Check size={17} /></div>
                <p className="admin-eyebrow">YOUR SETTINGS</p>
                <h2>Shape the next conversation.</h2>
                <p>These choices guide how the assistant helps students compare their options.</p>
                {settings.data.updatedAt && <div className="updated-line"><span>Last saved</span><time dateTime={settings.data.updatedAt} data-testid="text-admin-settings-updated">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(settings.data.updatedAt))}</time></div>}
                <button type="submit" className="admin-primary-button admin-save-button" disabled={update.isPending || (!isDirty && !saveError)} data-testid="button-save-admin-settings">
                  {update.isPending ? <><LoaderCircle className="admin-spin" size={16} /> Saving changes</> : <><Save size={16} /> Save settings</>}
                </button>
                <button type="button" className="admin-secondary-button reset-defaults-button" onClick={resetToDefaults} disabled={update.isPending} data-testid="button-reset-admin-defaults"><RotateCcw size={14} /> Reset to defaults</button>
                <button type="button" className="admin-secondary-button" onClick={() => void loadPromptPreview()} disabled={previewLoading} data-testid="button-preview-agent-prompt">{previewLoading ? 'Loading prompt…' : 'Preview final system prompt'}</button>
                {previewError && <p className="admin-form-error" role="alert">{previewError}</p>}
                {promptPreview && <details className="prompt-preview" open><summary>Prompt sent to the agent</summary><pre>{promptPreview}</pre></details>}
                <div className="agent-test-panel">
                  <label className="admin-label" htmlFor="agent-test-message">Test agent with the latest saved settings</label>
                  <input id="agent-test-message" value={testMessage} onChange={(event) => setTestMessage(event.target.value)} maxLength={1200} />
                  <button type="button" className="admin-secondary-button" onClick={() => void runAgentTest()} disabled={testLoading || update.isPending}>{testLoading ? 'Testing…' : 'Test agent'}</button>
                  {testError && <p className="admin-form-error" role="alert">{testError}</p>}
                  {testReply && <p className="agent-test-reply" role="status">{testReply}</p>}
                </div>
                {resetNote && <p className="unsaved-note" data-testid="status-admin-reset-note">Defaults loaded. Press Save settings to apply them.</p>}
                {isDirty && !resetNote && !update.isPending && <p className="unsaved-note" data-testid="status-admin-unsaved">Unsaved changes</p>}
                {saveError && <p className="admin-form-error save-error" role="alert" data-testid="status-admin-save-error">{saveError}</p>}
                {update.isSuccess && !isDirty && !saveError && <p className="save-success" role="status" data-testid="status-admin-save-success"><Check size={14} /> Settings saved</p>}
              </div>
              <div className="student-note"><span className="student-note-icon"><Sparkles size={15} /></span><p><strong>Keep the student in the lead.</strong> The guide can help someone think clearly without deciding for them.</p></div>
            </aside>
          </form>
          </Form>
        )}
      </main>
      <div className="admin-main"><ConversationAnalytics /></div>
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
