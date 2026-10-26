"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Flame,
  Globe,
  Key,
  Layers,
  Loader2,
  Lock,
  Radio,
  RefreshCw,
  Send,
  Server,
  ShieldCheck,
  Sliders,
  Trash2,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import {
  ConnectorMaskedSetting,
  ConnectorTestResult,
  ConnectorType,
} from "@/lib/types";

interface ConnectorSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  /** PREMISE_EXTRAS: shows the PagerDuty connector tab */
  extras?: boolean;
}

export function ConnectorSettingsModal({
  isOpen,
  onClose,
  onSaved,
  extras = false,
}: ConnectorSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<ConnectorType>("PROMETHEUS");
  const [connectors, setConnectors] = useState<ConnectorMaskedSetting[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Prometheus Form State
  const [promBaseUrl, setPromBaseUrl] = useState("http://localhost:9090");
  const [promAuthType, setPromAuthType] = useState<"none" | "bearer" | "basic">("none");
  const [promBearerToken, setPromBearerToken] = useState("");
  const [promUsername, setPromUsername] = useState("");
  const [promPassword, setPromPassword] = useState("");
  const [promCustomHeaders, setPromCustomHeaders] = useState("");

  // Datadog Form State
  const [ddSite, setDdSite] = useState("datadoghq.com");
  const [ddApiKey, setDdApiKey] = useState("");
  const [ddAppKey, setDdAppKey] = useState("");

  // Slack Form State
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const [slackChannel, setSlackChannel] = useState("#arch-decision-drift");
  const [slackBotName, setSlackBotName] = useState("Premise Kill-Switch Bot");

  // PagerDuty Form State
  const [pdRoutingKey, setPdRoutingKey] = useState("");
  const [pdSeverity, setPdSeverity] = useState<"critical" | "error" | "warning" | "info">("critical");

  // Visibility toggles
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  // Testing & Saving states
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<ConnectorTestResult | null>(null);

  // Fetch connector configs on open
  useEffect(() => {
    if (!isOpen) return;
    loadConnectors();
  }, [isOpen]);

  const loadConnectors = async () => {
    setIsLoading(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/connectors");
      const data = await res.json();
      if (data && data.connectors) {
        setConnectors(data.connectors);
        populateFormStates(data.connectors);
      }
    } catch {
      setStatusMsg({ type: "error", text: "Failed to load stored connector credentials." });
    } finally {
      setIsLoading(false);
    }
  };

  const populateFormStates = (list: ConnectorMaskedSetting[]) => {
    const prom = list.find((c) => c.connectorType === "PROMETHEUS");
    if (prom && (prom.isConfigured || prom.isDemoPlaceholder)) {
      const cfg = prom.maskedConfig as Record<string, any>;
      setPromBaseUrl(cfg.baseUrl || "http://localhost:9090");
      setPromAuthType(cfg.authType || "none");
      setPromBearerToken(cfg.bearerToken || "");
      setPromUsername(cfg.username || "");
      setPromPassword(cfg.password || "");
      setPromCustomHeaders(
        cfg.customHeaders ? JSON.stringify(cfg.customHeaders, null, 2) : ""
      );
    }

    const dd = list.find((c) => c.connectorType === "DATADOG");
    if (dd && (dd.isConfigured || dd.isDemoPlaceholder)) {
      const cfg = dd.maskedConfig as Record<string, any>;
      setDdSite(cfg.site || "datadoghq.com");
      setDdApiKey(cfg.apiKey || "");
      setDdAppKey(cfg.appKey || "");
    }

    const slack = list.find((c) => c.connectorType === "SLACK");
    if (slack && (slack.isConfigured || slack.isDemoPlaceholder)) {
      const cfg = slack.maskedConfig as Record<string, any>;
      setSlackWebhookUrl(cfg.webhookUrl || "");
      setSlackChannel(cfg.defaultChannel || "#arch-decision-drift");
      setSlackBotName(cfg.botUsername || "Premise Kill-Switch Bot");
    }

    const pd = list.find((c) => c.connectorType === "PAGERDUTY");
    if (pd && (pd.isConfigured || pd.isDemoPlaceholder)) {
      const cfg = pd.maskedConfig as Record<string, any>;
      setPdRoutingKey(cfg.routingKey || "");
      setPdSeverity(cfg.severity || "critical");
    }
  };

  const toggleShowSecret = (field: string) => {
    setShowSecrets((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const getActiveConfigForSave = (): Record<string, any> => {
    if (activeTab === "PROMETHEUS") {
      let customHeadersObj: Record<string, string> = {};
      if (promCustomHeaders.trim()) {
        try {
          customHeadersObj = JSON.parse(promCustomHeaders);
        } catch {
          // ignore parsing error
        }
      }
      return {
        baseUrl: promBaseUrl.trim(),
        authType: promAuthType,
        bearerToken: promBearerToken.trim(),
        username: promUsername.trim(),
        password: promPassword.trim(),
        customHeaders: customHeadersObj,
      };
    } else if (activeTab === "DATADOG") {
      return {
        site: ddSite.trim(),
        apiKey: ddApiKey.trim(),
        appKey: ddAppKey.trim(),
      };
    } else if (activeTab === "SLACK") {
      return {
        webhookUrl: slackWebhookUrl.trim(),
        defaultChannel: slackChannel.trim(),
        botUsername: slackBotName.trim(),
      };
    } else {
      // PAGERDUTY
      return {
        routingKey: pdRoutingKey.trim(),
        severity: pdSeverity,
      };
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setStatusMsg(null);
    try {
      const config = getActiveConfigForSave();
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          connectorType: activeTab,
          config,
        }),
      });
      const data = await res.json();
      if (res.ok && data.connectors) {
        setConnectors(data.connectors);
        populateFormStates(data.connectors);
        setStatusMsg({
          type: "success",
          text: `Saved ${activeTab} connector credentials to local SQLite store.`,
        });
        if (onSaved) onSaved();
      } else {
        setStatusMsg({
          type: "error",
          text: data.error || `Failed to save ${activeTab} credentials`,
        });
      }
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Network request failed" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setStatusMsg(null);
    try {
      const config = getActiveConfigForSave();
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          connectorType: activeTab,
          config,
        }),
      });
      const data = await res.json();
      if (data.testResult) {
        setTestResult(data.testResult);
      } else {
        setTestResult({
          ok: false,
          connectorType: activeTab,
          latencyMs: 0,
          message: data.error || "Connection test failed",
          error: data.error,
        });
      }
    } catch (err: any) {
      setTestResult({
        ok: false,
        connectorType: activeTab,
        latencyMs: 0,
        message: err.message || "Failed to execute connection test",
        error: err.message,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to clear stored ${activeTab} credentials?`)) {
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          connectorType: activeTab,
        }),
      });
      const data = await res.json();
      if (res.ok && data.connectors) {
        setConnectors(data.connectors);
        populateFormStates(data.connectors);
        setTestResult(null);
        setStatusMsg({
          type: "info",
          text: `Cleared ${activeTab} configuration from SQLite.`,
        });
      }
    } catch {
      setStatusMsg({ type: "error", text: "Failed to delete connector configuration." });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const configuredCount = connectors.filter((c) => c.isConfigured).length;
  const currentSetting = connectors.find((c) => c.connectorType === activeTab);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-100">
                  Production Telemetry Connectors & Live Outbound Dispatch
                </h2>
                <span className="px-2 py-0.5 rounded text-xs font-mono font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  HORIZON D
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Wire real Prometheus/Thanos, Datadog v2, Slack Block Kit, and PagerDuty v2 endpoints with zero-config local SQLite persistence.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700/60">
              {configuredCount}/4 Active
            </span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-900/40 px-6 gap-2">
          {[
            {
              id: "PROMETHEUS" as ConnectorType,
              label: "Prometheus / Thanos",
              icon: Server,
            },
            {
              id: "DATADOG" as ConnectorType,
              label: "Datadog Metric v2",
              icon: Activity,
            },
            {
              id: "SLACK" as ConnectorType,
              label: "Slack Webhook",
              icon: Send,
            },
            {
              id: "PAGERDUTY" as ConnectorType,
              label: "PagerDuty Events v2",
              icon: AlertOctagon,
            },
          ]
            .filter((tab) => extras || tab.id !== "PAGERDUTY")
            .map((tab) => {
            const tabSetting = connectors.find((c) => c.connectorType === tab.id);
            const isConfigured = tabSetting?.isConfigured;
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setTestResult(null);
                  setStatusMsg(null);
                }}
                className={`flex items-center gap-2 py-3 px-3.5 border-b-2 font-medium text-xs transition-colors ${
                  isSelected
                    ? "border-cyan-400 text-cyan-300 bg-cyan-500/5"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tabSetting?.isDemoPlaceholder ? (
                  <span
                    title="Demo placeholder"
                    className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-amber-400/20"
                  />
                ) : isConfigured ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/20" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-slate-600" />
                )}
              </button>
            );
          })}
        </div>

        {/* Status / Alert Banner */}
        {statusMsg && (
          <div
            className={`px-6 py-2.5 text-xs flex items-center justify-between border-b ${
              statusMsg.type === "success"
                ? "bg-emerald-950/40 text-emerald-300 border-emerald-900/60"
                : statusMsg.type === "error"
                ? "bg-rose-950/40 text-rose-300 border-rose-900/60"
                : "bg-blue-950/40 text-blue-300 border-blue-900/60"
            }`}
          >
            <span>{statusMsg.text}</span>
            <button
              onClick={() => setStatusMsg(null)}
              className="text-slate-400 hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modal Body / Active Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "PROMETHEUS" && (
            <div className="space-y-5">
              <div className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                    <Server className="w-3.5 h-3.5 text-orange-400" />
                    Prometheus / Thanos Telemetry Engine
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Queries <code className="text-cyan-300">/api/v1/query</code> (instant) and <code className="text-cyan-300">/api/v1/query_range</code> for load-bearing PromQL assertions.
                  </div>
                </div>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {currentSetting?.isDemoPlaceholder
                    ? "DEMO PLACEHOLDER"
                    : currentSetting?.isConfigured
                    ? "CONFIGURED"
                    : "UNBOUND"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Prometheus / Thanos Base URL
                  </label>
                  <input
                    type="text"
                    value={promBaseUrl}
                    onChange={(e) => setPromBaseUrl(e.target.value)}
                    placeholder="http://localhost:9090 or https://thanos-querier.internal"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Default: <code className="text-slate-400">http://localhost:9090</code>. Trailing slashes are stripped automatically.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Authentication Mode
                  </label>
                  <select
                    value={promAuthType}
                    onChange={(e) => setPromAuthType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="none">None / Open Endpoint</option>
                    <option value="bearer">Bearer Token (Authorization: Bearer)</option>
                    <option value="basic">Basic Auth (Username / Password)</option>
                  </select>
                </div>

                {promAuthType === "bearer" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
                      <span>Bearer Token</span>
                      <button
                        type="button"
                        onClick={() => toggleShowSecret("promBearer")}
                        className="text-slate-500 hover:text-slate-300"
                      >
                        {showSecrets["promBearer"] ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </label>
                    <input
                      type={showSecrets["promBearer"] ? "text" : "password"}
                      value={promBearerToken}
                      onChange={(e) => setPromBearerToken(e.target.value)}
                      placeholder={promBearerToken.startsWith("****") ? "••••••••••••••••" : "eyJhbGciOi..."}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                )}

                {promAuthType === "basic" && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Basic Auth Username
                      </label>
                      <input
                        type="text"
                        value={promUsername}
                        onChange={(e) => setPromUsername(e.target.value)}
                        placeholder="prom_reader"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
                        <span>Basic Auth Password</span>
                        <button
                          type="button"
                          onClick={() => toggleShowSecret("promPass")}
                          className="text-slate-500 hover:text-slate-300"
                        >
                          {showSecrets["promPass"] ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </label>
                      <input
                        type={showSecrets["promPass"] ? "text" : "password"}
                        value={promPassword}
                        onChange={(e) => setPromPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </>
                )}

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Custom Headers (Optional JSON)
                  </label>
                  <textarea
                    value={promCustomHeaders}
                    onChange={(e) => setPromCustomHeaders(e.target.value)}
                    rows={2}
                    placeholder='{"THANOS-TENANT-ID": "team-core", "X-Scope-OrgID": "prod"}'
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Pass multi-tenant routing headers like <code className="text-slate-400">THANOS-TENANT-ID</code> or Cortex <code className="text-slate-400">X-Scope-OrgID</code>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "DATADOG" && (
            <div className="space-y-5">
              <div className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-purple-400" />
                    Datadog Metric API v2 Telemetry Ingestion
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Connects directly to Datadog Metric API v2 (<code className="text-purple-300">/api/v2/query/timeseries</code>) with automated v1 fallback.
                  </div>
                </div>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {currentSetting?.isDemoPlaceholder
                    ? "DEMO PLACEHOLDER"
                    : currentSetting?.isConfigured
                    ? "CONFIGURED"
                    : "UNBOUND"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Datadog Site / Region
                  </label>
                  <select
                    value={ddSite}
                    onChange={(e) => setDdSite(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                  >
                    <option value="datadoghq.com">US1 (api.datadoghq.com)</option>
                    <option value="datadoghq.eu">EU (api.datadoghq.eu)</option>
                    <option value="us3.datadoghq.com">US3 (api.us3.datadoghq.com)</option>
                    <option value="us5.datadoghq.com">US5 (api.us5.datadoghq.com)</option>
                    <option value="ddog-gov.com">GovCloud (api.ddog-gov.com)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
                    <span>DD-API-KEY</span>
                    <button
                      type="button"
                      onClick={() => toggleShowSecret("ddApiKey")}
                      className="text-slate-500 hover:text-slate-300"
                    >
                      {showSecrets["ddApiKey"] ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </label>
                  <input
                    type={showSecrets["ddApiKey"] ? "text" : "password"}
                    value={ddApiKey}
                    onChange={(e) => setDdApiKey(e.target.value)}
                    placeholder={ddApiKey.startsWith("****") ? "••••••••••••••••••••••••••••••••" : "32-character API key"}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
                    <span>DD-APPLICATION-KEY</span>
                    <button
                      type="button"
                      onClick={() => toggleShowSecret("ddAppKey")}
                      className="text-slate-500 hover:text-slate-300"
                    >
                      {showSecrets["ddAppKey"] ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </label>
                  <input
                    type={showSecrets["ddAppKey"] ? "text" : "password"}
                    value={ddAppKey}
                    onChange={(e) => setDdAppKey(e.target.value)}
                    placeholder={ddAppKey.startsWith("****") ? "••••••••••••••••••••••••••••••••" : "40-character Application key"}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "SLACK" && (
            <div className="space-y-5">
              <div className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                    <Send className="w-3.5 h-3.5 text-emerald-400" />
                    Slack Incoming Webhook (Interactive Block Kit Alerts)
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Dispatches high-visibility Block Kit kill-switch alerts with interactive &apos;Acknowledge&apos; and &apos;Open Teardown PR&apos; action buttons.
                  </div>
                </div>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {currentSetting?.isDemoPlaceholder
                    ? "DEMO PLACEHOLDER"
                    : currentSetting?.isConfigured
                    ? "CONFIGURED"
                    : "UNBOUND"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
                    <span>Slack Incoming Webhook URL</span>
                    <button
                      type="button"
                      onClick={() => toggleShowSecret("slackWebhook")}
                      className="text-slate-500 hover:text-slate-300"
                    >
                      {showSecrets["slackWebhook"] ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </label>
                  <input
                    type={showSecrets["slackWebhook"] ? "text" : "password"}
                    value={slackWebhookUrl}
                    onChange={(e) => setSlackWebhookUrl(e.target.value)}
                    placeholder="https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Default Channel
                  </label>
                  <input
                    type="text"
                    value={slackChannel}
                    onChange={(e) => setSlackChannel(e.target.value)}
                    placeholder="#arch-decision-drift"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Bot Display Username
                  </label>
                  <input
                    type="text"
                    value={slackBotName}
                    onChange={(e) => setSlackBotName(e.target.value)}
                    placeholder="Premise Kill-Switch Bot"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Block Kit Card Preview */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                  Interactive Block Kit Card Preview
                </div>
                <div className="p-3 bg-slate-900 border-l-4 border-rose-500 rounded space-y-2">
                  <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                    🚨 PREMISE BROKEN: [ADR-014] Semantic Caching Gateway
                  </div>
                  <div className="text-[11px] text-slate-400">
                    🔴 <span className="text-rose-400 font-semibold">CRITICAL KILL-SWITCH</span> | Engine: Premise v3.0 | Triggered: 2026-10-23T01:42:00Z
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800">
                    <div>
                      <span className="text-slate-500 text-[10px] block">MONITORED METRIC</span>
                      <code className="text-cyan-400 font-mono text-[11px]">upstream_token_cost_usd</code>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">BREACH TELEMETRY</span>
                      <span className="text-rose-400 font-semibold font-mono">$0.80</span>{" "}
                      <span className="text-slate-500 text-[10px]">(Threshold: &gt; $2.50)</span>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2 border-t border-slate-800">
                    <span className="px-2.5 py-1 rounded text-[11px] font-medium bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">
                      ✅ Acknowledge Invalidation
                    </span>
                    <span className="px-2.5 py-1 rounded text-[11px] font-medium bg-rose-600/20 text-rose-300 border border-rose-500/30">
                      ⚡ Open Teardown PR
                    </span>
                    <span className="px-2.5 py-1 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                      🔍 View Control Plane
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "PAGERDUTY" && (
            <div className="space-y-5">
              <div className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                    <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
                    PagerDuty Events API v2 Incident Trigger
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Triggers architecture-level incidents at <code className="text-rose-300">https://events.pagerduty.com/v2/enqueue</code> with deduplication key per premise breach.
                  </div>
                </div>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {currentSetting?.isDemoPlaceholder
                    ? "DEMO PLACEHOLDER"
                    : currentSetting?.isConfigured
                    ? "CONFIGURED"
                    : "UNBOUND"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
                    <span>PagerDuty Integration / Routing Key</span>
                    <button
                      type="button"
                      onClick={() => toggleShowSecret("pdRouting")}
                      className="text-slate-500 hover:text-slate-300"
                    >
                      {showSecrets["pdRouting"] ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </label>
                  <input
                    type={showSecrets["pdRouting"] ? "text" : "password"}
                    value={pdRoutingKey}
                    onChange={(e) => setPdRoutingKey(e.target.value)}
                    placeholder={pdRoutingKey.startsWith("****") ? "••••••••••••••••••••••••••••••••" : "32-character Events v2 integration key"}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Default Alert Severity
                  </label>
                  <select
                    value={pdSeverity}
                    onChange={(e) => setPdSeverity(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                  >
                    <option value="critical">Critical (Page Architecture Council & SRE)</option>
                    <option value="error">Error (High Priority)</option>
                    <option value="warning">Warning (Standard Drift)</option>
                    <option value="info">Info (Audit Log Only)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Test Connection Output Card */}
          {testResult && (
            <div
              className={`p-4 rounded-xl border text-xs font-mono space-y-2 ${
                testResult.ok
                  ? "bg-emerald-950/20 border-emerald-900/60 text-emerald-300"
                  : "bg-rose-950/20 border-rose-900/60 text-rose-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold">
                  {testResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  )}
                  <span>
                    {testResult.ok ? "Connection Succeeded" : "Connection Test Failed"}
                  </span>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                  {testResult.latencyMs}ms latency
                </span>
              </div>
              <p className="text-slate-300">{testResult.message}</p>
              {Boolean(testResult.details) && (
                <pre className="p-2.5 bg-slate-950/80 rounded border border-slate-800/80 text-[11px] overflow-x-auto text-slate-400">
                  {JSON.stringify(testResult.details, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/60">
          <div>
            {currentSetting?.isConfigured && (
              <button
                type="button"
                onClick={handleDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/60 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Stored Credentials</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-50"
            >
              {isTesting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              ) : (
                <Wifi className="w-3.5 h-3.5 text-cyan-400" />
              )}
              <span>Test Live Connection</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md shadow-cyan-500/20 transition-colors disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>Save Credentials to SQLite</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
