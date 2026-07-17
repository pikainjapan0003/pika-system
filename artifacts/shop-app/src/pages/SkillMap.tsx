import { useAuth } from "@clerk/react";
import { useEffect, useMemo, useState } from "react";
import { useGetMyStore } from "@workspace/api-client-react";
import type {
  SkillPackagePreview,
  SkillPackageKey,
} from "@workspace/db/skill-map";
import { useLocation } from "wouter";

import { SKILL_GROUPS } from "@/lib/skillMap";
import { BottomNav } from "./Dashboard";

interface SkillStatus {
  skillKey: string;
  enabled: boolean;
  highRisk: boolean;
  prerequisite: { ready: boolean; missing: string[] };
}

interface SkillStateResponse {
  catalogVersion: number;
  skills: SkillStatus[];
}

interface PendingHighRisk {
  skillKey: string;
  title: string;
}

export default function SkillMapPage() {
  const [, setLocation] = useLocation();
  const { getToken } = useAuth();
  const { data: store } = useGetMyStore();
  const [state, setState] = useState<SkillStateResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [packagePreview, setPackagePreview] =
    useState<SkillPackagePreview | null>(null);
  const [pendingHighRisk, setPendingHighRisk] =
    useState<PendingHighRisk | null>(null);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);

  const statusByKey = useMemo(
    () =>
      new Map((state?.skills ?? []).map((skill) => [skill.skillKey, skill])),
    [state],
  );

  async function request(path: string, init?: RequestInit): Promise<any> {
    const token = await getToken();
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "技能設定暫時無法使用");
    return payload;
  }

  async function loadState() {
    if (!store?.id) return;
    setError("");
    try {
      setState(await request(`/api/stores/${store.id}/skills`));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  useEffect(() => {
    void loadState();
  }, [store?.id]);

  async function saveSkill(
    skillKey: string,
    enabled: boolean,
    confirmations = { confirmImpact: false, confirmRisk: false },
  ) {
    if (!store?.id || !state) return;
    setBusy(skillKey);
    setError("");
    try {
      await request(`/api/stores/${store.id}/skills/${skillKey}/enable`, {
        method: "POST",
        body: JSON.stringify({
          enabled,
          catalogVersion: state.catalogVersion,
          ...confirmations,
        }),
      });
      await loadState();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function toggleSkill(skillKey: string, title: string) {
    if (!store?.id) return;
    const current = statusByKey.get(skillKey);
    if (!current) return;
    const requestedEnabled = !current.enabled;
    setBusy(skillKey);
    setError("");
    try {
      const preview = await request(
        `/api/stores/${store.id}/skills/${skillKey}/preview`,
        {
          method: "POST",
          body: JSON.stringify({ enabled: requestedEnabled }),
        },
      );
      if (requestedEnabled && !preview.prerequisite.ready) {
        setError(preview.prerequisite.missing.join("；"));
        return;
      }
      if (
        !window.confirm(
          `${requestedEnabled ? "開啟" : "關閉"}「${title}」？關閉不會刪除既有資料。`,
        )
      ) {
        return;
      }
      if (preview.highRiskConfirmationRequired) {
        setRiskAcknowledged(false);
        setPendingHighRisk({ skillKey, title });
        return;
      }
      await saveSkill(skillKey, requestedEnabled);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function previewPackage(packageKey: SkillPackageKey) {
    if (!store?.id) return;
    setBusy(`package:${packageKey}`);
    setError("");
    try {
      setPackagePreview(
        await request(
          `/api/stores/${store.id}/skill-packages/${packageKey}/preview`,
          {
            method: "POST",
          },
        ),
      );
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function applyPackage() {
    if (!store?.id || !state || !packagePreview) return;
    setBusy(`package:${packagePreview.packageKey}`);
    setError("");
    try {
      await request(
        `/api/stores/${store.id}/skill-packages/${packagePreview.packageKey}/apply`,
        {
          method: "POST",
          body: JSON.stringify({ catalogVersion: state.catalogVersion }),
        },
      );
      setPackagePreview(null);
      await loadState();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-white px-5 pb-4 pt-10">
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setLocation("/settings")}
            className="w-16 text-left text-sm font-medium text-primary"
          >
            ‹ 返回
          </button>
          <h1 className="flex-1 text-center text-lg font-bold text-foreground">
            技能地圖
          </h1>
          <div className="w-16" />
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          先看差異再開啟；缺少前置條件的技能不會偷偷啟用。
        </p>
      </header>

      <main className="space-y-5 px-5 py-5">
        {error && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {SKILL_GROUPS.map((group) => (
          <section key={group.id} aria-labelledby={`skill-group-${group.id}`}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2
                  id={`skill-group-${group.id}`}
                  className="font-bold text-foreground"
                >
                  {group.title}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {group.description}
                </p>
              </div>
              <button
                type="button"
                className="min-h-11 shrink-0 rounded-xl border border-primary px-3 text-xs font-semibold text-primary disabled:opacity-50"
                disabled={!state || busy !== ""}
                onClick={() => void previewPackage(group.id)}
              >
                預覽套餐
              </button>
            </div>
            <div className="space-y-3">
              {group.skills.map((skill) => {
                const status = statusByKey.get(skill.id);
                const ready = status?.prerequisite.ready ?? false;
                return (
                  <article
                    key={skill.id}
                    className="rounded-2xl border border-border bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          {skill.id}
                        </p>
                        <h3 className="font-semibold text-foreground">
                          {skill.title}
                        </h3>
                      </div>
                      <button
                        type="button"
                        className="min-h-11 shrink-0 rounded-full px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 data-[enabled=true]:bg-emerald-100 data-[enabled=true]:text-emerald-700 data-[enabled=false]:bg-stone-100 data-[enabled=false]:text-stone-600"
                        data-enabled={status?.enabled ? "true" : "false"}
                        disabled={
                          !status || busy !== "" || (!status.enabled && !ready)
                        }
                        aria-pressed={status?.enabled ?? false}
                        title={
                          !ready
                            ? status?.prerequisite.missing.join("；")
                            : undefined
                        }
                        onClick={() => void toggleSkill(skill.id, skill.title)}
                      >
                        {status?.enabled
                          ? "已開啟"
                          : ready
                            ? "可開啟"
                            : "缺前置"}
                      </button>
                    </div>
                    {!ready && status && (
                      <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                        {status.prerequisite.missing.join("；")}
                      </p>
                    )}
                    <dl className="mt-3 grid gap-2 text-sm">
                      <div>
                        <dt className="font-medium text-foreground">
                          省什麼工
                        </dt>
                        <dd className="text-muted-foreground">{skill.saves}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-foreground">
                          開啟前要準備
                        </dt>
                        <dd className="text-muted-foreground">
                          {skill.prerequisite}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-foreground">
                          風險標記
                        </dt>
                        <dd className="text-muted-foreground">{skill.risk}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-foreground">
                          開了會發生什麼
                        </dt>
                        <dd className="text-muted-foreground">
                          {skill.effect}
                        </dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      {packagePreview && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="package-preview-title"
        >
          <div className="w-full max-w-[448px] rounded-2xl bg-white p-5">
            <h2 id="package-preview-title" className="font-bold">
              套餐差異預覽
            </h2>
            <p className="mt-2 text-sm">
              這次可直接開啟：{packagePreview.enableNow.join("、") || "無"}
            </p>
            <p className="mt-1 text-sm">
              已開啟不變：{packagePreview.alreadyEnabled.join("、") || "無"}
            </p>
            <p className="mt-1 text-sm">
              需逐項二段確認：
              {packagePreview.requiresConfirmation.join("、") || "無"}
            </p>
            <p className="mt-1 text-sm">
              缺前置而跳過：
              {packagePreview.missingPrerequisite
                .map((item) => item.skillKey)
                .join("、") || "無"}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                className="min-h-11 rounded-xl border"
                onClick={() => setPackagePreview(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="min-h-11 rounded-xl bg-primary font-semibold text-white disabled:opacity-50"
                disabled={busy !== "" || packagePreview.enableNow.length === 0}
                onClick={() => void applyPackage()}
              >
                套用低風險項目
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingHighRisk && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="risk-confirm-title"
        >
          <div className="w-full max-w-[448px] rounded-2xl bg-white p-5">
            <h2 id="risk-confirm-title" className="font-bold">
              第二次確認：{pendingHighRisk.title}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              這項技能涉及金額、個資、外部服務或對客發訊。系統會在送出時重新檢查前置條件。
            </p>
            <label className="mt-4 flex min-h-11 items-center gap-3 rounded-xl border p-3 text-sm">
              <input
                type="checkbox"
                checked={riskAcknowledged}
                onChange={(event) => setRiskAcknowledged(event.target.checked)}
              />
              我已閱讀影響與風險，確認要開啟
            </label>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                className="min-h-11 rounded-xl border"
                onClick={() => setPendingHighRisk(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="min-h-11 rounded-xl bg-primary font-semibold text-white disabled:opacity-50"
                disabled={!riskAcknowledged || busy !== ""}
                onClick={() => {
                  const pending = pendingHighRisk;
                  setPendingHighRisk(null);
                  void saveSkill(pending.skillKey, true, {
                    confirmImpact: true,
                    confirmRisk: true,
                  });
                }}
              >
                確認開啟
              </button>
            </div>
          </div>
        </div>
      )}
      <BottomNav active="settings" />
    </div>
  );
}
