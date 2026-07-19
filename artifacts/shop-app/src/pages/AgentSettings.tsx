import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  useGetMyStore,
  useGetSellerAgentSettings,
  useUpdateSellerAgentSettings,
  getGetSellerAgentSettingsQueryKey,
} from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";
import { BottomNav } from "./Dashboard";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AgentStatus = "disabled" | "enabled";
type AgentMode = "rule_worker" | "external_agent" | "self_hosted_webhook";
type QueryFrequency =
  | "manual"
  | "daily"
  | "every_6_hours"
  | "every_2_hours_high_tier";

type FormState = {
  agentStatus: AgentStatus;
  agentMode: AgentMode;
  queryFrequency: QueryFrequency;
  enabledLogistics: string[];
  queryMethods: string[];
  notifyOnUnknown: boolean;
  requireConfirmOnException: boolean;
  requireConfirmOnReturned: boolean;
  requireConfirmOnDelivered: boolean;
  hideErrorDetailsFromBuyer: boolean;
  webhookEnabled: boolean;
  webhookUrl: string;
};

const DEFAULT_FORM: FormState = {
  agentStatus: "disabled",
  agentMode: "rule_worker",
  queryFrequency: "manual",
  enabledLogistics: [],
  queryMethods: ["manual"],
  notifyOnUnknown: true,
  requireConfirmOnException: true,
  requireConfirmOnReturned: false,
  requireConfirmOnDelivered: false,
  hideErrorDetailsFromBuyer: true,
  webhookEnabled: false,
  webhookUrl: "",
};

const LOGISTICS_OPTIONS = [
  { value: "seven_eleven", label: "7-11" },
  { value: "family_mart", label: "全家" },
  { value: "home_delivery", label: "宅配" },
  { value: "other", label: "其他" },
  { value: "webhook", label: "Webhook" },
];

const QUERY_METHOD_OPTIONS = [
  { value: "manual", label: "手動查詢" },
  { value: "csv_import", label: "CSV 匯入" },
  { value: "webhook", label: "Webhook" },
  { value: "scheduled", label: "排程查詢" },
];

export default function AgentSettingsPage() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: store } = useGetMyStore();
  const storeId = store?.id;

  const {
    data: settingsResp,
    isLoading,
    isError,
    refetch,
  } = useGetSellerAgentSettings(storeId ?? 0, {
    query: { enabled: !!storeId } as any,
  });
  const settings = settingsResp?.data;

  const updateMutation = useUpdateSellerAgentSettings();

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const initialized = useRef(false);

  const [secretMode, setSecretMode] = useState<"hidden" | "editing">("hidden");
  const [newSecret, setNewSecret] = useState("");

  useEffect(() => {
    if (!settings || initialized.current) return;
    initialized.current = true;
    setIsDefault(!settings.id);

    const rawMode = settings.agentMode;
    const safeMode: AgentMode =
      rawMode === "rule_worker" ||
      rawMode === "external_agent" ||
      rawMode === "self_hosted_webhook"
        ? rawMode
        : "rule_worker";

    setForm({
      agentStatus: (settings.agentStatus as AgentStatus) ?? "disabled",
      agentMode: safeMode,
      queryFrequency: (settings.queryFrequency as QueryFrequency) ?? "manual",
      enabledLogistics: settings.enabledLogistics ?? [],
      queryMethods: settings.queryMethods ?? ["manual"],
      notifyOnUnknown: settings.notifyOnUnknown ?? true,
      requireConfirmOnException: settings.requireConfirmOnException ?? true,
      requireConfirmOnReturned: settings.requireConfirmOnReturned ?? false,
      requireConfirmOnDelivered: settings.requireConfirmOnDelivered ?? false,
      hideErrorDetailsFromBuyer: settings.hideErrorDetailsFromBuyer ?? true,
      webhookEnabled: settings.webhookEnabled ?? false,
      webhookUrl: settings.webhookUrl ?? "",
    });
  }, [settings]);

  const toggleArr = (arr: string[], value: string) =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  const handleSave = async () => {
    if (!storeId) return;
    setIsSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: Record<string, any> = {
        agentStatus: form.agentStatus,
        agentMode: form.agentMode,
        queryFrequency: form.queryFrequency,
        enabledLogistics: form.enabledLogistics,
        queryMethods: form.queryMethods,
        notifyOnUnknown: form.notifyOnUnknown,
        requireConfirmOnException: form.requireConfirmOnException,
        requireConfirmOnReturned: form.requireConfirmOnReturned,
        requireConfirmOnDelivered: form.requireConfirmOnDelivered,
        hideErrorDetailsFromBuyer: form.hideErrorDetailsFromBuyer,
        webhookEnabled: form.webhookEnabled,
        webhookUrl: form.webhookUrl.trim() || null,
      };

      if (secretMode === "editing" && newSecret.trim()) {
        payload.webhookSecret = newSecret.trim();
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateMutation.mutateAsync({ storeId, data: payload as any });
      await qc.invalidateQueries({
        queryKey: getGetSellerAgentSettingsQueryKey(storeId),
      });
      initialized.current = false;
      setSecretMode("hidden");
      setNewSecret("");
      setIsDefault(false);
      toast({ title: "Agent 設定已儲存" });
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = (err as any)?.data?.error ?? "請稍後再試";
      toast({ title: "儲存失敗", description: msg, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearSecret = async () => {
    if (!storeId) return;
    if (!window.confirm("確定要清除 Webhook Secret 嗎？此操作無法復原。"))
      return;
    setIsSaving(true);
    try {
      await updateMutation.mutateAsync({
        storeId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { webhookSecret: null } as any,
      });
      await qc.invalidateQueries({
        queryKey: getGetSellerAgentSettingsQueryKey(storeId),
      });
      initialized.current = false;
      setSecretMode("hidden");
      setNewSecret("");
      toast({ title: "Webhook Secret 已清除" });
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = (err as any)?.data?.error ?? "請稍後再試";
      toast({ title: "清除失敗", description: msg, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (!storeId) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-5">
        <p className="text-sm text-muted-foreground">請先設定店鋪</p>
        <BottomNav active="settings" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center flex-col gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <BottomNav active="settings" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-5">
        <div className="w-full max-w-sm space-y-4 text-center">
          <p className="font-medium text-foreground">無法載入 Agent 設定</p>
          <button
            onClick={() => void refetch()}
            className="text-sm text-primary underline"
          >
            重試
          </button>
        </div>
        <BottomNav active="settings" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-24">
      <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLocation("/settings")}
            className="text-muted-foreground text-xl leading-none pr-1"
            aria-label="返回"
          >
            ‹
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">AI 代查設定</h1>
            <p className="text-xs text-muted-foreground">
              設定老闆端自動查詢物流狀態、Webhook 串接與例外確認規則。
            </p>
          </div>
        </div>
      </header>

      <div className="px-5 py-5 space-y-5">
        {isDefault && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
            目前尚未儲存 Agent
            設定。你可以先調整欄位，按下儲存後系統會建立設定。
          </div>
        )}

        {/* A. AI 狀態 */}
        <Section title="AI 狀態">
          <SwitchRow
            label="啟用 AI 代查"
            checked={form.agentStatus === "enabled"}
            onCheckedChange={(v) =>
              setForm((f) => ({
                ...f,
                agentStatus: v ? "enabled" : "disabled",
              }))
            }
            disabled={isSaving}
          />
          <SelectRow
            label="Agent 模式"
            value={form.agentMode}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, agentMode: v as AgentMode }))
            }
            disabled={isSaving}
            options={[
              { value: "rule_worker", label: "規則工作器" },
              { value: "external_agent", label: "外部 Agent" },
              { value: "self_hosted_webhook", label: "自架 Webhook" },
            ]}
          />
        </Section>

        {/* B. 查詢設定 */}
        <Section title="查詢設定">
          <SelectRow
            label="查詢頻率"
            value={form.queryFrequency}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, queryFrequency: v as QueryFrequency }))
            }
            disabled={isSaving}
            options={[
              { value: "manual", label: "手動" },
              { value: "daily", label: "每日" },
              { value: "every_6_hours", label: "每 6 小時" },
              {
                value: "every_2_hours_high_tier",
                label: "每 2 小時，高頻方案",
              },
            ]}
          />
          <div>
            <p className="text-sm font-medium text-foreground mb-2">查詢方式</p>
            <div className="space-y-2">
              {QUERY_METHOD_OPTIONS.map((opt) => (
                <CheckboxRow
                  key={opt.value}
                  label={opt.label}
                  checked={form.queryMethods.includes(opt.value)}
                  onCheckedChange={() =>
                    setForm((f) => ({
                      ...f,
                      queryMethods: toggleArr(f.queryMethods, opt.value),
                    }))
                  }
                  disabled={isSaving}
                />
              ))}
            </div>
          </div>
        </Section>

        {/* C. 物流來源 */}
        <Section title="物流來源">
          <div className="space-y-2">
            {LOGISTICS_OPTIONS.map((opt) => (
              <CheckboxRow
                key={opt.value}
                label={opt.label}
                checked={form.enabledLogistics.includes(opt.value)}
                onCheckedChange={() =>
                  setForm((f) => ({
                    ...f,
                    enabledLogistics: toggleArr(f.enabledLogistics, opt.value),
                  }))
                }
                disabled={isSaving}
              />
            ))}
          </div>
        </Section>

        {/* D. 例外確認設定 */}
        <Section title="例外確認設定">
          <SwitchRow
            label="未知狀態通知老闆"
            checked={form.notifyOnUnknown}
            onCheckedChange={(v) =>
              setForm((f) => ({ ...f, notifyOnUnknown: v }))
            }
            disabled={isSaving}
          />
          <SwitchRow
            label="例外狀態需確認"
            checked={form.requireConfirmOnException}
            onCheckedChange={(v) =>
              setForm((f) => ({ ...f, requireConfirmOnException: v }))
            }
            disabled={isSaving}
          />
          <SwitchRow
            label="退回狀態需確認"
            checked={form.requireConfirmOnReturned}
            onCheckedChange={(v) =>
              setForm((f) => ({ ...f, requireConfirmOnReturned: v }))
            }
            disabled={isSaving}
          />
          <SwitchRow
            label="已送達狀態需確認"
            checked={form.requireConfirmOnDelivered}
            onCheckedChange={(v) =>
              setForm((f) => ({ ...f, requireConfirmOnDelivered: v }))
            }
            disabled={isSaving}
          />
          <SwitchRow
            label="對買家隱藏錯誤細節"
            checked={form.hideErrorDetailsFromBuyer}
            onCheckedChange={(v) =>
              setForm((f) => ({ ...f, hideErrorDetailsFromBuyer: v }))
            }
            disabled={isSaving}
          />
        </Section>

        {/* E. Webhook */}
        <Section title="Webhook">
          <SwitchRow
            label="啟用 Webhook"
            checked={form.webhookEnabled}
            onCheckedChange={(v) =>
              setForm((f) => ({ ...f, webhookEnabled: v }))
            }
            disabled={isSaving}
          />
          {form.webhookEnabled && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Webhook URL
              </label>
              <input
                type="url"
                value={form.webhookUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, webhookUrl: e.target.value }))
                }
                placeholder="https://..."
                disabled={isSaving}
                className={inputClass}
              />
            </div>
          )}

          <div className="space-y-2 pt-1">
            <p className="text-sm font-medium text-foreground">
              Webhook Secret
            </p>
            <p className="text-xs text-muted-foreground">
              Webhook Secret 不會顯示原文。若需要更換，請輸入新的 Secret
              後儲存。
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  settings?.hasWebhookSecret
                    ? "bg-green-100 text-green-700"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {settings?.hasWebhookSecret ? "已設定" : "未設定"}
              </span>
              {settings?.hasWebhookSecret && (
                <button
                  type="button"
                  onClick={() => void handleClearSecret()}
                  disabled={isSaving}
                  className="text-xs text-destructive underline disabled:opacity-60"
                >
                  清除
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  setSecretMode((m) => (m === "editing" ? "hidden" : "editing"))
                }
                disabled={isSaving}
                className="text-xs text-primary underline disabled:opacity-60"
              >
                {secretMode === "editing" ? "取消更換" : "更換 Secret"}
              </button>
            </div>
            {secretMode === "editing" && (
              <input
                type="password"
                value={newSecret}
                onChange={(e) => setNewSecret(e.target.value)}
                placeholder="輸入新的 Secret（至少 16 字元）"
                disabled={isSaving}
                className={inputClass}
              />
            )}
          </div>
        </Section>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="w-full h-12 bg-primary text-white font-semibold rounded-xl text-base disabled:opacity-60"
        >
          {isSaving ? "儲存中..." : "儲存設定"}
        </button>
      </div>

      <BottomNav active="settings" />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
      </div>
      <div className="px-5 pb-5 space-y-3">{children}</div>
    </div>
  );
}

function SwitchRow({
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-foreground">{label}</span>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <Checkbox
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}

function SelectRow({
  label,
  value,
  onValueChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger className="w-full h-12 rounded-xl border border-input bg-white text-foreground text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const inputClass =
  "w-full h-12 px-4 rounded-xl border border-input bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-base disabled:opacity-60";
