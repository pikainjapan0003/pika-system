import { useAuth } from "@clerk/react";
import { useState } from "react";

import {
  ONBOARDING_QUESTIONS,
  recommendOnboardingPackages,
  type OnboardingAnswers,
  type OnboardingPackageKey,
  type OnboardingRecommendation,
} from "./onboardingQuestionnaire";

interface PackagePreview {
  packageKey: OnboardingPackageKey;
  enableNow: string[];
  alreadyEnabled: string[];
  missingPrerequisite: Array<{ skillKey: string; missing: string[] }>;
  requiresConfirmation: string[];
}

interface RecommendationPreview {
  recommendation: OnboardingRecommendation;
  catalogVersion: number;
  packages: PackagePreview[];
}

const PACKAGE_LABELS: Record<OnboardingPackageKey, string> = {
  beginner: "新手套餐",
  cost: "成本套餐",
  shipping: "物流套餐",
  "group-buy": "團購套餐",
  wholesale: "批發套餐",
  automation: "自動化套餐",
};

export function OnboardingQuestionnaire({
  storeId,
  onApplied,
}: {
  storeId: number;
  onApplied: () => Promise<void> | void;
}) {
  const { getToken } = useAuth();
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [preview, setPreview] = useState<RecommendationPreview | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | "">("");
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);

  async function request(path: string, init?: RequestInit) {
    const token = await getToken();
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error ?? "推薦套餐暫時無法使用");
    }
    return payload;
  }

  async function showRecommendation(nextAnswers: OnboardingAnswers) {
    const recommendation = recommendOnboardingPackages(nextAnswers);
    setBusy("preview");
    setError("");
    try {
      const [skillState, ...packages] = await Promise.all([
        request(`/api/stores/${storeId}/skills`),
        ...recommendation.packagesToApply.map((packageKey) =>
          request(
            `/api/stores/${storeId}/skill-packages/${packageKey}/preview`,
            { method: "POST" },
          ),
        ),
      ]);
      setPreview({
        recommendation,
        catalogVersion: skillState.catalogVersion,
        packages,
      });
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function applyRecommendation() {
    if (!preview) return;
    setBusy("apply");
    setError("");
    try {
      for (const packageKey of preview.recommendation.packagesToApply) {
        await request(
          `/api/stores/${storeId}/skill-packages/${packageKey}/apply`,
          {
            method: "POST",
            body: JSON.stringify({
              catalogVersion: preview.catalogVersion,
            }),
          },
        );
      }
      setApplied(true);
      await onApplied();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy("");
    }
  }

  if (applied) {
    return (
      <section className="rounded-2xl border border-chart-3/30 bg-chart-3/10 p-4">
        <h2 className="text-sm font-semibold text-chart-3">推薦套餐已套用</h2>
        <p className="mt-1 text-xs text-secondary-foreground">
          可到技能地圖查看已開啟項目與仍需確認的高風險技能。
        </p>
      </section>
    );
  }

  if (preview) {
    const { recommendation, packages } = preview;
    return (
      <section className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
        <h2 className="text-sm font-semibold text-foreground">你的推薦套餐</h2>
        <p className="mt-1 text-sm font-bold text-primary">
          新手套餐
          {recommendation.mainPackage === "beginner"
            ? ""
            : ` ＋ ${PACKAGE_LABELS[recommendation.mainPackage]}`}
        </p>
        <div className="mt-3 space-y-2">
          {packages.map((item) => (
            <div
              key={item.packageKey}
              className="rounded-xl border border-border bg-card p-3 text-xs text-foreground"
            >
              <p className="font-semibold">{PACKAGE_LABELS[item.packageKey]}</p>
              <p className="mt-1">
                可立即開啟：
                {[...item.enableNow, ...item.alreadyEnabled].join("、") ||
                  "目前沒有"}
              </p>
              {item.requiresConfirmation.length > 0 && (
                <p className="mt-1 text-accent">
                  需到技能地圖確認：
                  {item.requiresConfirmation.join("、")}
                </p>
              )}
              {item.missingPrerequisite.length > 0 && (
                <p className="mt-1 text-accent">
                  前置條件尚未完成：
                  {item.missingPrerequisite
                    .map((entry) => entry.skillKey)
                    .join("、")}
                </p>
              )}
            </div>
          ))}
        </div>
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            className="min-h-11 rounded-xl border border-border bg-background text-sm font-semibold text-foreground"
            disabled={busy !== ""}
            onClick={() => setPreview(null)}
          >
            返回修改
          </button>
          <button
            type="button"
            className="min-h-11 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            disabled={busy !== ""}
            onClick={() => void applyRecommendation()}
          >
            {busy === "apply" ? "套用中…" : "套用推薦"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
      <h2 className="text-sm font-semibold text-foreground">
        用 4 題找到適合的技能套餐
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-secondary-foreground">
        先看推薦內容，再由你決定是否套用；未回答的題目不計分。
      </p>
      <div className="mt-4 space-y-4">
        {ONBOARDING_QUESTIONS.map((question, questionIndex) => (
          <fieldset key={question.key}>
            <legend className="text-sm font-semibold text-foreground">
              {questionIndex + 1}. {question.title}
            </legend>
            <div className="mt-2 space-y-2">
              {question.options.map((option) => (
                <label
                  key={option.value}
                  className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-card px-3 text-sm text-foreground"
                >
                  <input
                    type="radio"
                    name={question.key}
                    value={option.value}
                    checked={answers[question.key] === option.value}
                    onChange={() =>
                      setAnswers((current) => ({
                        ...current,
                        [question.key]: option.value,
                      }))
                    }
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      <button
        type="button"
        className="mt-4 min-h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        disabled={busy !== ""}
        onClick={() => void showRecommendation(answers)}
      >
        {busy === "preview" ? "整理推薦中…" : "查看推薦"}
      </button>
      <button
        type="button"
        className="mt-2 min-h-11 w-full text-sm font-medium text-primary disabled:opacity-50"
        disabled={busy !== ""}
        onClick={() => void showRecommendation({})}
      >
        跳過問卷，使用新手套餐
      </button>
    </section>
  );
}
