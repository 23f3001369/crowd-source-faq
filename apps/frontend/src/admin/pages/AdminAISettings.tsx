/**
 * AiSettings Admin Page — full dark-theme edition
 */

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import adminApi from '../utils/adminApi';
import { useBatch } from '../../context/BatchContext';

interface ProviderOverride { hasKey: boolean; baseURL: string; model: string; }
interface AiFeatureConfig { enabled: boolean; model: string; temperature: number; maxTokens: number; }
interface EmbeddingConfig { provider: 'local' | 'huggingface' | 'openai' | 'custom'; model: string; dimensions: number; baseURL: string; hasKey: boolean; }
interface AiConfig {
  // Backend can return the sentinel 'none' when no provider has any key
  // configured — this signals "system is unconfigured" rather than
  // pretending one of the providers is active.
  activeProvider: 'anthropic' | 'openai' | 'xai' | 'minimax' | 'gemini' | 'custom' | 'none';
  providers: { anthropic: ProviderOverride; openai: ProviderOverride; xai: ProviderOverride; minimax: ProviderOverride; gemini: ProviderOverride; custom: ProviderOverride; };
  features: { duplicateDetection: AiFeatureConfig; knowledgeExtraction: AiFeatureConfig; searchSummarization: AiFeatureConfig; faqGeneration: AiFeatureConfig; };
  embedding: EmbeddingConfig;
  usage: { totalRequests: number; totalEstimatedCost: number; lastResetAt: string; };
  isActive: boolean;
}

// Per-provider hasKey truth from /admin/ai/providers. This is the
// authoritative source for "is the provider actually wired up" —
// `isActive` alone only tells you which one is selected, not whether
// it has a working API key. Previously the UI conflated the two and
// showed "Configured ✓ Active" for unconfigured systems.
type ProviderKeyStatus = Record<'anthropic' | 'openai' | 'xai' | 'minimax' | 'gemini' | 'custom', boolean>;

const PROVIDER_META = {
  anthropic: {
    label: 'Anthropic Claude',
    description: 'Best for complex reasoning and analysis',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultBaseURL: 'https://api.anthropic.com/v1',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    badgeColor: 'bg-accent/10 text-accent border-accent/20',
    suggestedModels: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-20240229', 'claude-sonnet-4-20250514']
  },
  openai:    {
    label: 'OpenAI GPT',
    description: 'Fast, cost-effective for most tasks',
    defaultModel: 'gpt-4o-mini',
    defaultBaseURL: 'https://api.openai.com/v1',
    docsUrl: 'https://platform.openai.com/api-keys',
    badgeColor: 'bg-success/10 text-success border-success/20',
    suggestedModels: ['gpt-4o-mini', 'gpt-4o', 'o1-mini', 'o1-preview']
  },
  xai:       {
    label: 'xAI Grok',
    description: 'Strong reasoning with real-time data access',
    defaultModel: 'grok-3',
    defaultBaseURL: 'https://api.x.ai/v1',
    docsUrl: 'https://console.x.ai/',
    badgeColor: 'bg-warning/10 text-warning border-warning/20',
    suggestedModels: ['grok-3', 'grok-2-1212', 'grok-2', 'grok-beta']
  },
  minimax:   {
    label: 'MiniMax',
    description: 'Cost-effective multilingual support',
    defaultModel: 'MiniMax-Text-01',
    defaultBaseURL: 'https://api.minimax.io/v1',
    docsUrl: 'https://platform.minimax.io',
    badgeColor: 'bg-accent/10 text-accent border-accent/20',
    suggestedModels: ['MiniMax-Text-01', 'abab6.5g', 'abab6.5-chat']
  },
  gemini:    {
    label: 'Google Gemini',
    description: 'Highly capable, cost-efficient reasoning',
    defaultModel: 'gemini-1.5-flash',
    defaultBaseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    badgeColor: 'bg-accent/10 text-accent border-accent/20',
    suggestedModels: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro']
  },
  custom:    {
    label: 'Custom Provider',
    description: 'Any self-hosted or OpenAI-compatible endpoint',
    defaultModel: '',
    defaultBaseURL: 'http://localhost:11434/v1',
    docsUrl: 'https://github.com/ollama/ollama',
    badgeColor: 'bg-border/60 text-ink-soft border-border',
    suggestedModels: ['llama-3.3-70b-versatile', 'llama3', 'mistral', 'mixtral']
  },
} as const;

const FEATURE_LABELS: Record<keyof AiConfig['features'], string> = {
  duplicateDetection:   '🔍 Duplicate Detection',
  knowledgeExtraction:  '📚 Knowledge Extraction',
  searchSummarization:  '✨ Search Summarization',
  faqGeneration:        '🤖 FAQ Generation',
};

type ProviderKey = keyof typeof PROVIDER_META;

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/30 ${checked ? 'bg-accent' : 'bg-border-medium'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      disabled={disabled}>
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full shadow-sm transition-transform duration-200 ${checked ? 'bg-accent-text translate-x-[18px]' : 'bg-ink-soft translate-x-0.5'}`} />
    </button>
  );
}

// Per-chat-provider edit form used by the unified Provider Settings card.
// All four fields + health badge + test/save buttons live here, driven by
// the provider selected in the parent card's dropdown.
function ChatProviderFields({
  provider, draft, setProviderDrafts, override, isActive, hasKey, monoInput,
  saving, testing, testResult, onSwitchActive, onTest, onSave, onReveal, onClear,
  savingProviderGlobal,
}: {
  provider: ProviderKey;
  draft: { apiKey: string; baseURL: string; model: string; showKey: boolean; revealing: boolean };
  setProviderDrafts: React.Dispatch<React.SetStateAction<Record<ProviderKey, any>>>;
  override: { hasKey: boolean; baseURL?: string; model?: string } | undefined;
  isActive: boolean;
  hasKey: boolean;
  monoInput: string;
  saving: boolean;
  testing: boolean;
  testResult: { ok: boolean; message: string } | null;
  onSwitchActive: (p: string) => void;
  onTest: (p: string) => void;
  onSave: (p: ProviderKey) => void;
  onReveal: (p: ProviderKey) => void;
  onClear: (p: ProviderKey) => void;
  savingProviderGlobal: boolean;
}) {
  const meta = PROVIDER_META[provider];
  const healthBadge = isActive
    ? hasKey
      ? { dot: 'bg-success', text: 'Configured', tone: 'text-success' }
      : { dot: 'bg-danger', text: 'Active but no API key configured', tone: 'text-danger font-semibold' }
    : { dot: 'bg-border-medium', text: 'Not active', tone: 'text-ink-faint' };

  return (
    <div className="space-y-4">
      {/* Header: provider identity + health badge + switch-active button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${healthBadge.dot}`} />
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${meta.badgeColor}`}>{meta.label}</span>
          <span className={`text-[11px] font-mono ${healthBadge.tone}`}>{healthBadge.text}</span>
        </div>
        {!isActive && (
          <button type="button" onClick={() => onSwitchActive(provider)} disabled={savingProviderGlobal}
            className="admin-btn-secondary px-3 py-1.5 text-xs disabled:opacity-50">
            {savingProviderGlobal ? 'Switching…' : `Make ${meta.label} active`}
          </button>
        )}
      </div>

      {/* Two-column layout: API key + URL/model. Wider layout (max-w-5xl)
          means we can fit everything without stacking. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-ink-faint uppercase">API Key</span>
            {override?.hasKey && (
              <div className="flex items-center gap-2 text-[10px]">
                <button type="button" onClick={() => onReveal(provider)} disabled={draft.revealing} className="text-accent hover:text-accent-hover font-medium disabled:opacity-50">
                  {draft.revealing ? 'Revealing…' : draft.showKey ? 'Hide' : 'Reveal'}
                </button>
                <span className="text-border-medium">·</span>
                <button type="button" onClick={() => onClear(provider)} disabled={saving} className="text-danger hover:text-danger/80 font-medium disabled:opacity-50">Clear</button>
              </div>
            )}
          </label>
          <input
            type={draft.showKey ? 'text' : 'password'}
            value={draft.apiKey}
            onChange={e => setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], apiKey: e.target.value, showKey: true } }))}
            placeholder={override?.hasKey ? '•••••••••••••• (stored) — type to replace' : 'Paste your API key here…'}
            autoComplete="off" className={monoInput} />
          <p className="text-[10px] text-ink-faint mt-1">
            Get a key: <a href={meta.docsUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">{meta.docsUrl.replace('https://','')}</a>
          </p>
        </div>

        <div>
          <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Base URL <span className="text-[9px] font-normal">(optional)</span></label>
          <input type="text" value={draft.baseURL}
            onChange={e => setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], baseURL: e.target.value } }))}
            placeholder={meta.defaultBaseURL} className={monoInput} />
          <p className="text-[10px] text-ink-faint mt-1">Proxy / gateway / OpenAI-compatible endpoint.</p>
        </div>

        <div>
          <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Default Model <span className="text-[9px] font-normal">(optional)</span></label>
          <input type="text" list={`suggested-models-${provider}`} value={draft.model}
            onChange={e => setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], model: e.target.value } }))}
            placeholder={meta.defaultModel} className={monoInput} />
          <datalist id={`suggested-models-${provider}`}>
            {meta.suggestedModels.map(m => <option key={m} value={m} />)}
          </datalist>
        </div>
      </div>

      {/* Action row: test + result + save */}
      <div className="pt-2 border-t border-border flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onTest(provider)}
            disabled={testing || !hasKey}
            title={!hasKey ? 'Save an API key before testing the connection.' : undefined}
            className="admin-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
            {testing ? <><span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />Testing…</> : 'Test Connection'}
          </button>
          {testResult && (
            <span className={`text-xs font-semibold ${testResult.ok ? 'text-success' : 'text-danger'}`}>
              {testResult.ok ? '✓ Connected' : `✕ ${testResult.message}`}
            </span>
          )}
        </div>
        <button type="button" onClick={() => onSave(provider)} disabled={saving}
          className="admin-btn-primary px-4 py-1.5 text-xs disabled:opacity-50">
          {saving ? 'Saving…' : `Save ${meta.label}`}
        </button>
      </div>
    </div>
  );
}

// Embedding model edit form. Same shape as ChatProviderFields but with
// the embedding-specific fields (provider, dimensions, model, baseURL, key)
// and the dimension-mismatch warning that fires when the draft dimensions
// diverge from what the backend currently stores.
function EmbeddingFields({
  embeddingDraft, setEmbeddingDraft, config, monoInput, saving, testing, testResult, onTest, onSave,
}: {
  embeddingDraft: { provider: 'local' | 'huggingface' | 'openai' | 'custom'; model: string; dimensions: number; apiKey: string; baseURL: string; showKey: boolean; revealing: boolean };
  setEmbeddingDraft: React.Dispatch<React.SetStateAction<any>>;
  config: AiConfig | null;
  monoInput: string;
  saving: boolean;
  testing: boolean;
  testResult: { ok: boolean; message: string } | null;
  onTest: () => void;
  onSave: () => void;
}) {
  const requiresApi = embeddingDraft.provider !== 'local';
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${config?.embedding?.hasKey ? 'bg-success' : 'bg-warning'}`} />
        <span className="text-sm font-semibold text-ink">Embedding Model</span>
        <span className="text-[11px] font-mono text-ink-faint">
          {config?.embedding?.hasKey ? 'Configured' : 'Env / Local Default'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Embedding Provider</label>
          <select value={embeddingDraft.provider}
            onChange={e => setEmbeddingDraft((prev: any) => ({ ...prev, provider: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg text-xs border bg-bg-secondary text-ink focus:outline-none admin-input">
            <option value="local">Local (In-Process)</option>
            <option value="huggingface">HuggingFace Inference</option>
            <option value="openai">OpenAI Embeddings</option>
            <option value="custom">Custom OpenAI-Compatible</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Vector Dimensions</label>
          <input type="number" value={embeddingDraft.dimensions}
            onChange={e => setEmbeddingDraft((prev: any) => ({ ...prev, dimensions: parseInt(e.target.value) || 1024 }))}
            className={monoInput} placeholder="1024" min="1" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Model Name</label>
          <input type="text" list="embedding-suggested-models" value={embeddingDraft.model}
            onChange={e => setEmbeddingDraft((prev: any) => ({ ...prev, model: e.target.value }))}
            placeholder="mixedbread-ai/mxbai-embed-large-v1" className={monoInput} />
          <datalist id="embedding-suggested-models">
            <option value="mixedbread-ai/mxbai-embed-large-v1" />
            <option value="text-embedding-3-small" />
            <option value="text-embedding-3-large" />
            <option value="text-embedding-ada-002" />
          </datalist>
        </div>
      </div>

      {requiresApi && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Base URL</label>
            <input type="text" value={embeddingDraft.baseURL}
              onChange={e => setEmbeddingDraft((prev: any) => ({ ...prev, baseURL: e.target.value }))}
              placeholder={
                embeddingDraft.provider === 'huggingface' ? 'https://router.huggingface.co/hf-inference/models' :
                embeddingDraft.provider === 'openai' ? 'https://api.openai.com/v1' : 'http://localhost:11434/v1'
              } className={monoInput} />
          </div>
          <div>
            <label className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-ink-faint uppercase">API Key</span>
              {config?.embedding?.hasKey && (
                <div className="flex items-center gap-2 text-[10px]">
                  <button type="button" onClick={() => setEmbeddingDraft((prev: any) => ({ ...prev, showKey: !prev.showKey }))} className="text-accent hover:text-accent-hover font-medium">
                    {embeddingDraft.showKey ? 'Hide' : 'Reveal'}
                  </button>
                  <span className="text-border-medium">·</span>
                  <button type="button" onClick={() => setEmbeddingDraft((prev: any) => ({ ...prev, apiKey: '' }))} className="text-danger hover:text-danger/80 font-medium">Clear</button>
                </div>
              )}
            </label>
            <input type={embeddingDraft.showKey ? 'text' : 'password'} value={embeddingDraft.apiKey}
              onChange={e => setEmbeddingDraft((prev: any) => ({ ...prev, apiKey: e.target.value, showKey: true }))}
              placeholder={config?.embedding?.hasKey ? '•••••••••••••• (stored) — type to replace' : 'Paste your API key here…'}
              autoComplete="off" className={monoInput} />
          </div>
        </div>
      )}

      <div className="pt-2 border-t border-border flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onTest} disabled={testing}
            className="admin-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-50">
            {testing ? <><span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />Testing…</> : 'Test Connection'}
          </button>
          {testResult && (
            <span className={`text-xs font-semibold ${testResult.ok ? 'text-success' : 'text-danger'}`}>
              {testResult.ok ? '✓ Connected' : `✕ ${testResult.message}`}
            </span>
          )}
        </div>
        <button type="button" onClick={onSave} disabled={saving}
          className="admin-btn-primary px-4 py-1.5 text-xs disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Embedding settings'}
        </button>
      </div>

      {/* Vector Index Dimension Mismatch Warning */}
      {config?.embedding && config.embedding.dimensions !== embeddingDraft.dimensions && (
        <div className="p-3 bg-warning/10 border border-warning/30 rounded-xl text-xs text-warning space-y-1">
          <p className="font-semibold">⚠️ Vector Dimension Change Detected</p>
          <p>You changed dimensions from <strong>{config.embedding.dimensions}</strong> to <strong>{embeddingDraft.dimensions}</strong>. Run <code className="bg-warning/20 px-1 rounded">npm run create:vector-index -- --drop && npm run backfill:embeddings</code> to rebuild the MongoDB Search Index, or search queries will crash.</p>
        </div>
      )}
    </div>
  );
}

export default function AdminAISettings() {
  // v1.69 — Phase 12: per-program AI config. When ?batchId=...
  // is supplied in the URL, every read/write targets the
  // per-program override (or auto-creates one on first save).
  // The page surfaces a 'no override — falling back to global'
  // hint when the resolver returns hasOverride:false so the
  // admin knows their edits will be saved as an override.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeBatchId = searchParams.get('batchId');
  const { availableBatches, currentBatch: activeProgram } = useBatch();
  // v1.71 — derive the displayed program name from the URL-selected
  // activeBatchId (not from BatchContext), so the "Saving as per-program
  // override for X" label always matches the scope button that's actually
  // selected. Without this, BatchContext.currentBatch could be a stale
  // value (e.g. user picked a different scope in another tab) and the
  // label would mislead.
  const selectedBatch = activeBatchId
    ? availableBatches.find((b) => b._id === activeBatchId)
    : undefined;
  const displayedBatchName = selectedBatch?.name ?? activeProgram?.name;

  const [config, setConfig] = useState<AiConfig | null>(null);
  const [hasOverride, setHasOverride] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string>('anthropic');
  // Which provider is currently being edited in the unified Provider
  // Settings card. Drives the dropdown + the fields rendered below.
  // Defaults to the active provider so the most-relevant config is
  // always shown first. `'embedding'` is a special value that swaps
  // the edit form into embedding-provider mode.
  const [editingProvider, setEditingProvider] = useState<ProviderKey | 'embedding'>('anthropic');
  // Per-provider hasKey truth, fetched from /admin/ai/providers. Used
  // by the Provider Health card to surface "No API key" badges so an
  // unconfigured provider is visibly distinct from a working one.
  const [providerKeyStatus, setProviderKeyStatus] = useState<ProviderKeyStatus>({
    anthropic: false, openai: false, xai: false, minimax: false, gemini: false, custom: false,
  });
  const [features, setFeatures] = useState<AiConfig['features'] | null>(null);
  const [savingProvider, setSavingProvider] = useState(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ provider: string; ok: boolean; message: string } | null>(null);
  const [providerDrafts, setProviderDrafts] = useState<Record<ProviderKey, { apiKey: string; baseURL: string; model: string; showKey: boolean; revealing: boolean }>>({
    anthropic: { apiKey: '', baseURL: '', model: '', showKey: false, revealing: false },
    openai:    { apiKey: '', baseURL: '', model: '', showKey: false, revealing: false },
    xai:       { apiKey: '', baseURL: '', model: '', showKey: false, revealing: false },
    minimax:   { apiKey: '', baseURL: '', model: '', showKey: false, revealing: false },
    gemini:    { apiKey: '', baseURL: '', model: '', showKey: false, revealing: false },
    custom:    { apiKey: '', baseURL: '', model: '', showKey: false, revealing: false },
  });
  const [savingProviderDraft, setSavingProviderDraft] = useState<ProviderKey | null>(null);

  const [embeddingDraft, setEmbeddingDraft] = useState<{
    provider: 'local' | 'huggingface' | 'openai' | 'custom';
    model: string;
    dimensions: number;
    apiKey: string;
    baseURL: string;
    showKey: boolean;
    revealing: boolean;
  }>({
    provider: 'local',
    model: 'mixedbread-ai/mxbai-embed-large-v1',
    dimensions: 1024,
    apiKey: '',
    baseURL: '',
    showKey: false,
    revealing: false,
  });
  const [savingEmbeddingDraft, setSavingEmbeddingDraft] = useState(false);
  const [testingEmbedding, setTestingEmbedding] = useState(false);
  const [embeddingTestResult, setEmbeddingTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      // Fetch config and per-provider hasKey in parallel. The config
      // endpoint alone only tells us which provider is "active" — to
      // know whether each provider actually has an API key we need the
      // dedicated providers endpoint. Without this, the UI cannot
      // distinguish a working provider from an unconfigured one.
      const [configRes, providersRes] = await Promise.all([
        adminApi.get<AiConfig & { hasOverride?: boolean; source?: string }>('/admin/ai/config', {
          params: activeBatchId ? { batchId: activeBatchId } : undefined,
        }),
        adminApi.get<{ providers: Array<{ id: string; hasKey: boolean }> }>('/admin/ai/providers'),
      ]);
      const data = configRes.data;
      setConfig(data);
      setActiveProvider(data.activeProvider);
      setFeatures(data.features);
      setHasOverride(data.hasOverride ?? true);
      setProviderDrafts(prev => {
        const next = { ...prev };
        for (const p of ['anthropic','openai','xai','minimax','gemini','custom'] as ProviderKey[]) {
          next[p] = { ...next[p], apiKey: '' , baseURL: data.providers[p]?.baseURL ?? '', model: data.providers[p]?.model ?? '' };
        }
        return next;
      });
      // Seed providerKeyStatus from the providers endpoint.
      const status: ProviderKeyStatus = { anthropic: false, openai: false, xai: false, minimax: false, gemini: false, custom: false };
      for (const p of providersRes.data.providers ?? []) {
        if (p.id in status) status[p.id as keyof ProviderKeyStatus] = !!p.hasKey;
      }
      setProviderKeyStatus(status);
      if (data.embedding) {
        setEmbeddingDraft(prev => ({
          ...prev,
          provider: data.embedding.provider || 'local',
          model: data.embedding.model || 'mixedbread-ai/mxbai-embed-large-v1',
          dimensions: data.embedding.dimensions || 1024,
          baseURL: data.embedding.baseURL || '',
          apiKey: ''
        }));
      }
    } catch { setError('Failed to load AI configuration.'); }
    finally { setLoading(false); }
  }, [activeBatchId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleFeatureToggle = (feature: keyof AiConfig['features']) => { if (!features) return; setFeatures(p => p ? { ...p, [feature]: { ...p[feature], enabled: !p[feature].enabled } } : p); setHasChanges(true); };
  const handleModelChange = (feature: keyof AiConfig['features'], model: string) => { if (!features) return; setFeatures(p => p ? { ...p, [feature]: { ...p[feature], model } } : p); setHasChanges(true); };
  const handleTempChange = (feature: keyof AiConfig['features'], temperature: number) => { if (!features) return; setFeatures(p => p ? { ...p, [feature]: { ...p[feature], temperature } } : p); setHasChanges(true); };
  const handleMaxTokensChange = (feature: keyof AiConfig['features'], maxTokens: number) => { if (!features) return; setFeatures(p => p ? { ...p, [feature]: { ...p[feature], maxTokens } } : p); setHasChanges(true); };

  const handleSaveFeatures = async () => {
    if (!features) return; setSaving(true); setError('');
    try {
      await adminApi.patch('/admin/ai/config', { features, batchId: activeBatchId ?? null });
      setSuccess('AI feature settings saved.'); setHasChanges(false); loadConfig(); setTimeout(() => setSuccess(''), 3000);
    }
    catch (err: any) { setError(err.response?.data?.message || 'Failed to save settings.'); }
    finally { setSaving(false); }
  };

  const handleSwitchProvider = async (provider: string) => {
    setSavingProvider(true); setError('');
    try {
      await adminApi.patch('/admin/ai/config', { activeProvider: provider, batchId: activeBatchId ?? null });
      setActiveProvider(provider); setConfig(p => p ? { ...p, activeProvider: provider as any } : p);
      setSuccess(`Provider switched to ${PROVIDER_META[provider as ProviderKey].label}.`); setTimeout(() => setSuccess(''), 3000);
    }
    catch { setError('Failed to switch provider.'); }
    finally { setSavingProvider(false); }
  };

  const handleResetUsage = async () => {
    if (!confirm('Reset usage statistics? This cannot be undone.')) return;
    try { await adminApi.post('/admin/ai/config/reset-usage'); loadConfig(); setSuccess('Usage statistics reset.'); setTimeout(() => setSuccess(''), 3000); }
    catch { setError('Failed to reset usage.'); }
  };

  const handleTestProvider = async (provider: string) => {
    setTestingProvider(provider); setTestResult(null);
    // Pre-flight guard: if the provider has no API key configured,
    // skip the network round-trip and surface a clean message. The
    // backend now does the same check on its side, but doing it here
    // saves the request entirely and gives the UI a stable, non-401
    // error string to display.
    if (!providerKeyStatus[provider as keyof ProviderKeyStatus]) {
      setTestResult({ provider, ok: false, message: `No API key configured for ${provider}. Save a key first, then test.` });
      setTestingProvider(null);
      return;
    }
    try { const res = await adminApi.get<{ ok: boolean; message: string }>('/admin/ai/providers/test', { params: { provider } }); setTestResult({ provider, ok: res.data.ok, message: res.data.message }); }
    catch (err: any) { setTestResult({ provider, ok: false, message: err.response?.data?.message || 'Connection failed' }); }
    finally { setTestingProvider(null); }
  };

  const handleSaveProviderDraft = async (provider: ProviderKey) => {
    const draft = providerDrafts[provider]; setSavingProviderDraft(provider); setError('');
    try {
      const body: Record<string, unknown> = {
        providers: { [provider]: { baseURL: draft.baseURL, model: draft.model, ...(draft.apiKey ? { apiKey: draft.apiKey } : {}) } },
        batchId: activeBatchId ?? null,
      };
      await adminApi.patch('/admin/ai/config', body);
      setSuccess(`${PROVIDER_META[provider].label} configuration saved.`);
      setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], apiKey: '' } }));
      setTimeout(() => setSuccess(''), 3000); loadConfig();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save provider configuration.'); }
    finally { setSavingProviderDraft(null); }
  };

  const handleClearApiKey = async (provider: ProviderKey) => {
    if (!confirm(`Clear the stored API key for ${PROVIDER_META[provider].label}?`)) return;
    setSavingProviderDraft(provider); setError('');
    try {
      await adminApi.patch('/admin/ai/config', { providers: { [provider]: { apiKey: '' } }, batchId: activeBatchId ?? null });
      setSuccess(`${PROVIDER_META[provider].label} API key cleared.`);
      setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], apiKey: '' } }));
      setTimeout(() => setSuccess(''), 3000); loadConfig();
    }
    catch (err: any) { setError(err.response?.data?.message || 'Failed to clear API key.'); }
    finally { setSavingProviderDraft(null); }
  };

  const handleRevealApiKey = async (provider: ProviderKey) => {
    setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], revealing: true } }));
    try {
      const res = await adminApi.get<{ apiKey: string | null }>(`/admin/ai/config/api-key/${provider}`);
      const key = res.data.apiKey;
      if (key) setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], apiKey: key, showKey: true, revealing: false } }));
      else { setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], revealing: false } })); setError(`${PROVIDER_META[provider].label} has no API key configured.`); setTimeout(() => setError(''), 4000); }
    } catch { setProviderDrafts(prev => ({ ...prev, [provider]: { ...prev[provider], revealing: false } })); setError('Failed to reveal API key.'); }
  };

  const handleSaveEmbeddingDraft = async () => {
    setSavingEmbeddingDraft(true); setError(''); setSuccess('');
    try {
      const body: Record<string, unknown> = {
        embedding: {
          provider: embeddingDraft.provider,
          model: embeddingDraft.model,
          dimensions: embeddingDraft.dimensions,
          baseURL: embeddingDraft.baseURL,
          ...(embeddingDraft.apiKey ? { apiKey: embeddingDraft.apiKey } : {}),
        },
        batchId: activeBatchId ?? null,
      };
      await adminApi.patch('/admin/ai/config', body);
      setSuccess(`Embedding configuration saved.`);
      setEmbeddingDraft(prev => ({ ...prev, apiKey: '' }));
      setTimeout(() => setSuccess(''), 3000); loadConfig();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save embedding configuration.');
    } finally {
      setSavingEmbeddingDraft(false);
    }
  };

  const handleRevealEmbeddingKey = async () => {
    setEmbeddingDraft(prev => ({ ...prev, revealing: true }));
    try {
      const res = await adminApi.get<{ apiKey: string | null }>(`/admin/ai/config/api-key/embedding`);
      const key = res.data.apiKey;
      if (key) setEmbeddingDraft(prev => ({ ...prev, apiKey: key, showKey: true, revealing: false }));
      else { setEmbeddingDraft(prev => ({ ...prev, revealing: false })); setError(`Embedding has no API key configured.`); setTimeout(() => setError(''), 4000); }
    } catch { setEmbeddingDraft(prev => ({ ...prev, revealing: false })); setError('Failed to reveal API key.'); }
  };

  const handleClearEmbeddingKey = async () => {
    if (!confirm(`Clear the stored embedding API key?`)) return;
    setSavingEmbeddingDraft(true); setError('');
    try {
      await adminApi.patch('/admin/ai/config', { embedding: { apiKey: '' }, batchId: activeBatchId ?? null });
      setSuccess(`Embedding API key cleared.`);
      setEmbeddingDraft(prev => ({ ...prev, apiKey: '' }));
      setTimeout(() => setSuccess(''), 3000); loadConfig();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to clear API key.');
    } finally {
      setSavingEmbeddingDraft(false);
    }
  };

  const handleTestEmbedding = async () => {
    setTestingEmbedding(true); setEmbeddingTestResult(null);
    try {
      const res = await adminApi.get<{ ok: boolean; message: string }>('/admin/ai/providers/test', { params: { provider: 'embedding' } });
      setEmbeddingTestResult({ ok: res.data.ok, message: res.data.message });
    } catch (err: any) {
      setEmbeddingTestResult({ ok: false, message: err.response?.data?.message || 'Connection failed' });
    } finally {
      setTestingEmbedding(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-6xl">
        <div className="h-8 w-48 bg-mist rounded animate-pulse" />
        <div className="h-64 admin-card-surface animate-pulse" />
      </div>
    );
  }

  const currentMeta = PROVIDER_META[activeProvider as ProviderKey];
  const monoInput = 'w-full px-3 py-2 rounded-lg text-xs border bg-bg-secondary text-ink font-mono focus:outline-none transition-colors admin-input';

  return (
    <div className="space-y-6 max-w-6xl">
      <p className="text-sm text-ink-faint -mt-2">Configure AI providers, API keys, custom endpoints, and per-feature parameters.</p>

      {/* v1.69 — Phase 12: per-program scope selector. When a
          program is picked, every read/write targets the
          per-program override. Without a selection, the page
          edits the global default. The 'no override' badge
          surfaces when the resolver returned hasOverride:false
          so the admin knows their next save will create one. */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
          Scope:
        </span>
        <button
          type="button"
          onClick={() => { const next = new URLSearchParams(searchParams); next.delete('batchId'); setSearchParams(next); }}
          className={`px-3 py-1 rounded-md text-xs font-medium ${
            !activeBatchId ? 'bg-accent text-accent-text' : 'bg-mist text-ink-soft hover:bg-cream'
          }`}
        >
          Global default
        </button>
        {availableBatches.map((b) => (
          <button
            key={b._id}
            type="button"
            onClick={() => { const next = new URLSearchParams(searchParams); next.set('batchId', b._id); setSearchParams(next); }}
            className={`px-3 py-1 rounded-md text-xs font-medium ${
              activeBatchId === b._id ? 'bg-accent text-accent-text' : 'bg-mist text-ink-soft hover:bg-cream'
            }`}
          >
            {b.name}
            {b.isDefault && <span className="ml-1 text-[9px] font-semibold uppercase">★</span>}
          </button>
        ))}
        {activeBatchId && !hasOverride && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-warning bg-warning/10 border border-warning/30 rounded-md px-2 py-0.5">
            ⚠ No per-program override — falling back to global
          </span>
        )}
        {activeBatchId && hasOverride && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-accent bg-accent/10 border border-accent/30 rounded-md px-2 py-0.5">
            ✓ Per-program override active
          </span>
        )}
        {displayedBatchName && activeBatchId && (
          <span className="text-[10px] text-ink-faint ml-auto">
            Saving as per-program override for <span className="font-semibold text-ink">{displayedBatchName}</span>
          </span>
        )}
      </div>

      {success && <div className="flex items-center gap-2 px-4 py-3 admin-toast-success rounded-xl text-sm"><span>✓</span> {success}</div>}
      {error   && <div className="flex items-center gap-2 px-4 py-3 admin-toast-error  rounded-xl text-sm"><span>✕</span> {error}</div>}

      {/* ── Active Provider ──────────────────────────────────────── */}
      <div className="admin-card-surface">
        <div className="admin-card-header bg-mist/40">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">Active Provider</p>
              <p className="text-xs text-ink-faint mt-0.5">Click a provider to make it the default for all AI features.</p>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${currentMeta.badgeColor}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />{currentMeta.label}
            </span>
          </div>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.keys(PROVIDER_META) as ProviderKey[]).map((key) => {
            const meta = PROVIDER_META[key];
            const isActive = activeProvider === key;
            const configured = !!(config?.providers[key]?.hasKey || config?.providers[key]?.baseURL);
            return (
              <button key={key} onClick={() => !isActive && handleSwitchProvider(key)} disabled={savingProvider}
                className={`relative p-4 rounded-xl border-2 text-left transition-all duration-200 ${isActive ? 'border-accent bg-accent/5' : 'border-border hover:border-border-medium hover:bg-mist'} ${savingProvider ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                {isActive && <span className="absolute top-2 right-2 text-accent text-xs font-bold">● Active</span>}
                <p className="text-sm font-semibold text-ink">{meta.label}</p>
                <p className="text-xs text-ink-faint mt-0.5">{meta.description}</p>
                <p className="text-[10px] text-ink-faint mt-1 font-mono">{meta.defaultModel}</p>
                {configured && <p className="text-[10px] text-accent mt-1 font-semibold">Custom config set</p>}
              </button>
            );
          })}
        </div>
      </div>

  {/* ── Provider Settings (unified: chat providers + embedding) ───
            Replaces the old "Provider Credentials" + "Embedding Configuration"
            + "Provider Health" trio. The dropdown picks which provider to
            edit; only the selected provider's fields render. Embedding is
            a special value of the dropdown that swaps into embedding-mode
            (provider + dimensions + model + baseURL + key). */}
        <div className="admin-card-surface">
          <div className="admin-card-header bg-mist/40 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink">Provider Settings</p>
              <p className="text-xs text-ink-faint mt-0.5">Edit API keys, endpoints, and test connections for any provider or the embedding model.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <label className="text-[10px] font-semibold text-ink-faint uppercase">Editing</label>
              <select
                value={editingProvider}
                onChange={e => {
                  const v = e.target.value as ProviderKey | 'embedding';
                  setEditingProvider(v);
                  // Clear stale test result when switching providers so the
                  // badge doesn't mislead the user about the new provider's
                  // health.
                  setTestResult(null);
                  setEmbeddingTestResult(null);
                }}
                className="px-3 py-1.5 rounded-lg text-xs border bg-bg-secondary text-ink font-medium focus:outline-none admin-input min-w-[14rem]"
              >
                {(Object.keys(PROVIDER_META) as ProviderKey[]).map(k => (
                  <option key={k} value={k}>{PROVIDER_META[k].label}</option>
                ))}
                <option value="embedding">— Embedding Model —</option>
              </select>
            </div>
          </div>

          <div className="p-5">
            {editingProvider === 'embedding' ? (
              <EmbeddingFields
                embeddingDraft={embeddingDraft}
                setEmbeddingDraft={setEmbeddingDraft}
                config={config}
                monoInput={monoInput}
                saving={savingEmbeddingDraft}
                testing={testingEmbedding}
                testResult={embeddingTestResult}
                onTest={handleTestEmbedding}
                onSave={handleSaveEmbeddingDraft}
              />
            ) : (
              <ChatProviderFields
                provider={editingProvider}
                draft={providerDrafts[editingProvider]}
                setProviderDrafts={setProviderDrafts}
                override={config?.providers[editingProvider]}
                isActive={activeProvider === editingProvider}
                hasKey={providerKeyStatus[editingProvider]}
                monoInput={monoInput}
                saving={savingProviderDraft === editingProvider}
                testing={testingProvider === editingProvider}
                testResult={testResult?.provider === editingProvider ? testResult : null}
                onSwitchActive={handleSwitchProvider}
                onTest={handleTestProvider}
                onSave={handleSaveProviderDraft}
                onReveal={handleRevealApiKey}
                onClear={handleClearApiKey}
                savingProviderGlobal={savingProvider}
              />
            )}
          </div>
        </div>

      {/* ── Usage Statistics ─────────────────────────────────────── */}
      <div className="admin-card-surface">
        <div className="admin-card-header bg-mist/40 flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">Usage Statistics</p>
          <button onClick={handleResetUsage} className="text-xs text-ink-faint hover:text-danger transition-colors">Reset stats</button>
        </div>
        <div className="p-5 grid grid-cols-3 gap-4">
          {[
            { label: 'Total Requests', value: config?.usage?.totalRequests?.toLocaleString() ?? '0' },
            { label: 'Estimated Cost (USD)', value: `$${(config?.usage?.totalEstimatedCost ?? 0).toFixed(4)}` },
            { label: 'Last Reset', value: config?.usage?.lastResetAt ? new Date(config.usage.lastResetAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—' },
          ].map(s => (
            <div key={s.label} className="admin-stat-mini text-center p-3">
              <p className="text-2xl font-bold text-ink">{s.value}</p>
              <p className="text-xs text-ink-faint mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Feature Configuration ────────────────────────────────── */}
      <div className="admin-card-surface">
        <div className="admin-card-header bg-mist/40 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">Feature Configuration</p>
            <p className="text-xs text-ink-faint mt-0.5">Per-feature model selection and parameters.</p>
          </div>
          <button onClick={handleSaveFeatures} disabled={saving || !hasChanges} className="admin-btn-primary px-4 py-2 text-xs">{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
        {features && (
          <div className="divide-y divide-border">
            {(Object.keys(FEATURE_LABELS) as Array<keyof typeof FEATURE_LABELS>).map((feature) => {
              const f = features[feature];
              // Defensive: if a feature key is missing from the API
              // response (stale DB doc, partial update, etc.), skip the
              // row instead of crashing the whole page.
              if (!f) return null;
              return (
                <div key={feature} className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink">{FEATURE_LABELS[feature]}</p>
                      <p className="text-xs text-ink-faint">
                        {feature === 'duplicateDetection'  && 'Blocks duplicate posts before creation'}
                        {feature === 'knowledgeExtraction' && 'Extracts Q&A pairs from transcripts and posts'}
                        {feature === 'searchSummarization' && 'Generates concise answers from search results'}
                        {feature === 'faqGeneration'       && 'Drafts official FAQ entries from community posts'}
                      </p>
                    </div>
                    <Toggle checked={f.enabled} onChange={() => handleFeatureToggle(feature)} />
                  </div>
                  <div className={`grid grid-cols-3 gap-3 ${f.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                    <div>
                      <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Model</label>
                      <input type="text" list={`feature-suggested-models-${activeProvider}`} value={f.model} onChange={e => handleModelChange(feature, e.target.value)} className="admin-input text-xs" />
                      <datalist id={`feature-suggested-models-${activeProvider}`}>
                        {PROVIDER_META[activeProvider as ProviderKey]?.suggestedModels.map(m => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Temperature <span className="text-[9px] font-normal">(0–1)</span></label>
                      <input type="number" min="0" max="1" step="0.05" value={Number(f.temperature.toFixed(2))} onChange={e => handleTempChange(feature, parseFloat(e.target.value) || 0)} className="admin-input text-xs" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-ink-faint uppercase mb-1">Max Tokens</label>
                      <input type="number" min="64" max="8192" step="64" value={f.maxTokens} onChange={e => handleMaxTokensChange(feature, parseInt(e.target.value) || 1024)} className="admin-input text-xs" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      </div>
  );
}
