import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@clerk/react";
import { useGetMyStore } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  FileImage,
  LockKeyhole,
  ShieldAlert,
  Upload,
} from "lucide-react";
import { BottomNav } from "./Dashboard";
import { InvoiceOcrBenchmarkPanel } from "@/components/invoiceOcr/InvoiceOcrBenchmarkPanel";
import { InvoiceOcrResultPanel } from "@/components/invoiceOcr/InvoiceOcrResultPanel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  analyzeInvoiceOcrTestCase,
  createInvoiceOcrTestCase,
  downloadInvoiceOcrCsv,
  getInvoiceOcrSummary,
  INVOICE_OCR_MODELS,
  InvoiceOcrApiError,
  listInvoiceOcrTestCases,
  reviewInvoiceOcrRun,
  updateInvoiceOcrGroundTruth,
  validateInvoiceFile,
  type InvoiceFields,
  type InvoiceOcrModel,
  type InvoiceOcrReview,
  type InvoiceOcrRun,
  type InvoiceOcrSummary,
  type InvoiceOcrTestCase,
} from "@/lib/invoiceOcrUi";

type PagePhase =
  | "idle"
  | "saving"
  | "saved"
  | "uploading"
  | "analyzing"
  | "completed"
  | "failed";

const PHASE_LABELS: Record<PagePhase, string> = {
  idle: "尚未建立測試案例",
  saving: "正在保存人工正確答案",
  saved: "人工正確答案已保存，可以開始辨識",
  uploading: "正在上傳照片",
  analyzing: "OpenAI 正在辨識",
  completed: "辨識完成，請逐欄人工確認",
  failed: "辨識失敗，等待已結束",
};

export default function InvoiceOcrTestPage() {
  const [, setLocation] = useLocation();
  const { getToken } = useAuth();
  const { data: store, isLoading: storeLoading } = useGetMyStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const fileSelectionModeRef = useRef<"new" | "existing">("new");

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [merchantName, setMerchantName] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [model, setModel] = useState<InvoiceOcrModel>("gpt-5.6-terra");
  const [phase, setPhase] = useState<PagePhase>("idle");
  const [testCase, setTestCase] = useState<InvoiceOcrTestCase | null>(null);
  const [run, setRun] = useState<InvoiceOcrRun | null>(null);
  const [review, setReview] = useState<InvoiceOcrReview | null>(null);
  const [testCases, setTestCases] = useState<InvoiceOcrTestCase[]>([]);
  const [summary, setSummary] = useState<InvoiceOcrSummary | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loadingData, setLoadingData] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [rerunOpen, setRerunOpen] = useState(false);
  const [unknownRerunOpen, setUnknownRerunOpen] = useState(false);

  const busy =
    phase === "saving" || phase === "uploading" || phase === "analyzing";

  const releasePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
  }, []);

  useEffect(() => releasePreview, [releasePreview]);

  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  const refreshData = useCallback(async () => {
    if (!store?.id) return;
    setLoadingData(true);
    try {
      const [list, nextSummary] = await Promise.all([
        listInvoiceOcrTestCases({ storeId: store.id, getToken }),
        getInvoiceOcrSummary({ storeId: store.id, getToken }),
      ]);
      setTestCases(list.testCases);
      setSummary(nextSummary);
      setTestCase((current) => {
        if (!current) return current;
        return list.testCases.find((item) => item.id === current.id) ?? current;
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "無法載入發票測試資料。",
      );
    } finally {
      setLoadingData(false);
    }
  }, [getToken, store?.id]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  function resetModelResult() {
    setRun(null);
    setReview(null);
    requestIdRef.current = null;
  }

  function openFilePicker(mode: "new" | "existing") {
    fileSelectionModeRef.current = mode;
    fileInputRef.current?.click();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = "";
    const keepSelectedTestCase =
      fileSelectionModeRef.current === "existing" && testCase !== null;
    fileSelectionModeRef.current = "new";
    if (!selected) return;
    const validationError = validateInvoiceFile(selected);
    if (validationError) {
      setError(validationError);
      return;
    }
    setPrivacyConfirmed(false);
    releasePreview();
    const nextPreview = URL.createObjectURL(selected);
    previewUrlRef.current = nextPreview;
    setPreviewUrl(nextPreview);
    setFile(selected);
    setError("");
    setSuccessMessage("");
    if (!keepSelectedTestCase) {
      setTestCase(null);
      setPhase("idle");
      resetModelResult();
    }
  }

  async function handleSaveGroundTruth() {
    if (!store?.id) return;
    if (testCase?.groundTruthLockedAt) {
      setError("這筆人工正確答案已在第一次 AI 辨識開始時永久鎖定。");
      return;
    }
    if (!testCase && !file) return;
    if (!testCase && !privacyConfirmed) {
      setError("請先勾選資料分享提醒。");
      return;
    }
    if (
      !merchantName.trim() ||
      !invoiceDate ||
      !totalAmount.trim() ||
      !currency.trim()
    ) {
      setError("請先填完店名、日期、總額和幣別。");
      return;
    }
    setPhase("saving");
    setError("");
    setSuccessMessage("");
    const groundTruth = {
      merchantName: merchantName.trim(),
      invoiceDate,
      totalAmount: totalAmount.trim(),
      currency: currency.trim().toUpperCase(),
    };
    try {
      let savedTestCase: InvoiceOcrTestCase;
      if (testCase) {
        const result = await updateInvoiceOcrGroundTruth({
          storeId: store.id,
          testCaseId: testCase.id,
          groundTruth,
          getToken,
        });
        savedTestCase = {
          ...testCase,
          ...result.testCase,
          runs: testCase.runs,
        };
        setSuccessMessage("人工正確答案已更新並保存成功。");
      } else {
        if (!file) return;
        const result = await createInvoiceOcrTestCase({
          storeId: store.id,
          file,
          privacyConfirmed,
          groundTruth,
          getToken,
        });
        savedTestCase = result.testCase;
        setSuccessMessage("人工正確答案已保存成功。");
      }
      setTestCase(savedTestCase);
      setMerchantName(savedTestCase.groundTruth.merchantName);
      setInvoiceDate(savedTestCase.groundTruth.invoiceDate);
      setTotalAmount(savedTestCase.groundTruth.totalAmount);
      setCurrency(savedTestCase.groundTruth.currency);
      setPhase("saved");
      resetModelResult();
      await refreshData();
    } catch (saveError) {
      if (
        testCase &&
        saveError instanceof InvoiceOcrApiError &&
        saveError.code === "ground_truth_locked"
      ) {
        setMerchantName(testCase.groundTruth.merchantName);
        setInvoiceDate(testCase.groundTruth.invoiceDate);
        setTotalAmount(testCase.groundTruth.totalAmount);
        setCurrency(testCase.groundTruth.currency);
        setTestCase({
          ...testCase,
          groundTruthLockedAt:
            testCase.groundTruthLockedAt ?? new Date().toISOString(),
        });
      }
      setPhase(testCase ? "saved" : "idle");
      setError(
        saveError instanceof Error
          ? saveError.message
          : "人工正確答案沒有儲存。",
      );
      if (
        saveError instanceof InvoiceOcrApiError &&
        saveError.code === "ground_truth_locked"
      ) {
        await refreshData();
      }
    }
  }

  const hasCompletedSelectedModel = useMemo(
    () =>
      (run?.status === "completed" && run.requestedModel === model) ||
      testCase?.runs?.some(
        (item) =>
          item.run.status === "completed" && item.run.requestedModel === model,
      ) === true,
    [model, run, testCase],
  );

  async function handleAnalyze(
    confirmRerun: boolean,
    confirmUnknownRerun = false,
  ) {
    if (!store?.id || !file || !testCase) return;
    if (!privacyConfirmed) {
      setError("請先勾選資料分享提醒，再傳送照片進行辨識。");
      return;
    }
    if (confirmRerun || confirmUnknownRerun || !requestIdRef.current) {
      requestIdRef.current = crypto.randomUUID();
    }
    const clientRequestId = requestIdRef.current;
    setPhase("uploading");
    setError("");
    setSuccessMessage("");
    const analyzingTimer = window.setTimeout(() => setPhase("analyzing"), 600);
    try {
      const result = await analyzeInvoiceOcrTestCase({
        storeId: store.id,
        testCaseId: testCase.id,
        file,
        model,
        confirmRerun,
        confirmUnknownRerun,
        clientRequestId,
        getToken,
      });
      if (result.requiresUnknownRerunConfirmation) {
        setRun(null);
        setReview(null);
        setPhase("failed");
        setError(
          result.warning ??
            "上一筆辨識狀態不明，可能已有 Token 用量。系統不會自動再次辨識。",
        );
        setUnknownRerunOpen(true);
        await refreshData();
        return;
      }
      if (result.run.status === "processing") {
        setRun(null);
        setReview(null);
        setPhase("failed");
        setError(
          "原本的請求仍在伺服器處理。請稍後再按一次查看狀態，不要建立新的請求。",
        );
        await refreshData();
        return;
      }
      setRun(result.run);
      setReview(result.review);
      if (
        result.run.status === "failed" &&
        (result.run.errorCode === "openai_timeout_unknown" ||
          result.run.errorCode === "stale_processing_unknown")
      ) {
        setPhase("failed");
        setError(
          "無法確定 OpenAI 是否已收到這次請求。請先查看 OpenAI Usage；本頁不會自動重送。",
        );
        await refreshData();
        return;
      }
      setPhase(
        result.run.status === "completed"
          ? "completed"
          : result.run.status === "failed"
            ? "failed"
            : "analyzing",
      );
      requestIdRef.current = null;
      await refreshData();
    } catch (analyzeError) {
      if (
        analyzeError instanceof InvoiceOcrApiError &&
        !analyzeError.code.startsWith("browser_") &&
        analyzeError.code !== "openai_timeout_unknown" &&
        analyzeError.code !== "stale_processing_unknown" &&
        analyzeError.code !== "invoice_ocr_previous_status_unknown"
      ) {
        // The server definitely answered, so a later manual retry must use a
        // fresh id. Browser timeouts/network errors keep the id to avoid a
        // second charge when the original server request may still be running.
        requestIdRef.current = null;
      }
      setPhase("failed");
      if (
        analyzeError instanceof InvoiceOcrApiError &&
        analyzeError.code === "invoice_ocr_previous_status_unknown"
      ) {
        setUnknownRerunOpen(true);
      }
      setError(
        analyzeError instanceof Error ? analyzeError.message : "發票辨識失敗。",
      );
      await refreshData();
    } finally {
      window.clearTimeout(analyzingTimer);
    }
  }

  function startAnalyze() {
    if (hasCompletedSelectedModel) {
      setRerunOpen(true);
      return;
    }
    void handleAnalyze(false);
  }

  async function handleReview(corrected: InvoiceFields | null) {
    if (!store?.id || !run) return;
    const result = await reviewInvoiceOcrRun({
      storeId: store.id,
      runId: run.id,
      corrected,
      getToken,
    });
    setReview(result.review);
    await refreshData();
  }

  async function handleDownload() {
    if (!store?.id) return;
    setDownloading(true);
    setError("");
    try {
      await downloadInvoiceOcrCsv({ storeId: store.id, getToken });
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "CSV 沒有下載。",
      );
    } finally {
      setDownloading(false);
    }
  }

  function handleSelectCase(selected: InvoiceOcrTestCase) {
    releasePreview();
    setFile(null);
    setPrivacyConfirmed(false);
    setTestCase(selected);
    setMerchantName(selected.groundTruth.merchantName);
    setInvoiceDate(selected.groundTruth.invoiceDate);
    setTotalAmount(selected.groundTruth.totalAmount);
    setCurrency(selected.groundTruth.currency);
    setSuccessMessage("");
    const latest = selected.runs?.[0] ?? null;
    if (latest?.run.status === "processing") {
      setRun(null);
      setReview(null);
      setPhase("failed");
      setError(
        "前次辨識仍在伺服器處理。請稍後重新整理本頁，不要重新上傳以免重複計費。",
      );
      requestIdRef.current = null;
      return;
    }
    setRun(latest?.run ?? null);
    setReview(latest?.review ?? null);
    setPhase(
      latest?.run.status === "completed"
        ? "completed"
        : latest?.run.status === "failed"
          ? "failed"
          : "saved",
    );
    setError("若要再次辨識，請重新選擇這筆案例原本的同一張照片。");
    requestIdRef.current = null;
  }

  function goBack() {
    if (busy && !window.confirm("照片仍在處理中，確定要離開這個頁面嗎？")) {
      return;
    }
    setLocation("/settings");
  }

  if (storeLoading) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background">
        <span className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-[calc(112px+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="返回設定"
            onClick={goBack}
          >
            <ArrowLeft className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-foreground sm:text-lg">
              發票 AI 辨識測試
            </h1>
            <p className="text-xs text-muted-foreground">
              第一階段，只測 10 張，不會自動入帳
            </p>
          </div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
            僅供測試
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-5">
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0" />
            <div>
              <h2 className="font-bold">上傳前請先確認</h2>
              <p className="mt-1 text-sm leading-6">
                此發票照片會傳送到 OpenAI。此 API Project
                已開啟資料分享，以取得符合資格的每日免費
                Token。請確認你有權上傳此照片，且照片不包含不應分享的敏感資訊。
              </p>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={privacyConfirmed}
                  onChange={(event) =>
                    setPrivacyConfirmed(event.target.checked)
                  }
                  disabled={busy}
                  className="mt-1 size-4 accent-primary"
                />
                <span>我已閱讀並確認可以使用這張測試照片。</span>
              </label>
            </div>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          >
            {successMessage}
          </div>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-foreground">1. 選擇單張照片</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    JPG、PNG、WebP，最大 12 MB；HEIC 請先轉 JPG。
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {testCase && summary?.totalTestCases !== 10 && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => openFilePicker("new")}
                    >
                      建立新案例
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      busy || (!testCase && summary?.totalTestCases === 10)
                    }
                    onClick={() =>
                      openFilePicker(testCase ? "existing" : "new")
                    }
                  >
                    <Upload className="size-4" />
                    {testCase ? "選回原圖" : "選擇照片"}
                  </Button>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            <div className="grid min-h-[360px] place-items-center bg-muted/30 p-3">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="發票原圖預覽"
                  className="max-h-[70vh] w-full rounded-xl object-contain"
                />
              ) : (
                <div className="max-w-xs text-center text-muted-foreground">
                  <FileImage className="mx-auto size-12 opacity-50" />
                  <p className="mt-3 text-sm">
                    {testCase
                      ? "這筆舊案例不保存照片；若要重跑，請重新選擇同一張原圖。"
                      : "照片只會在這個預覽和本次伺服器記憶體中短暫使用。"}
                  </p>
                </div>
              )}
            </div>
            {file && (
              <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
                {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </section>

          <div className="space-y-5">
            <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <LockKeyhole className="mt-0.5 size-5 text-primary" />
                <div>
                  <h2 className="font-bold text-foreground">
                    2. 先填人工正確答案
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    保存後才能辨識；這四個答案絕不會傳給 OpenAI。
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <FormField label="店名">
                  <Input
                    value={merchantName}
                    onChange={(event) => setMerchantName(event.target.value)}
                    disabled={busy || !!testCase?.groundTruthLockedAt}
                    placeholder="人工確認的完整店名"
                  />
                </FormField>
                <FormField label="日期">
                  <Input
                    type="date"
                    value={invoiceDate}
                    onChange={(event) => setInvoiceDate(event.target.value)}
                    disabled={busy || !!testCase?.groundTruthLockedAt}
                  />
                </FormField>
                <FormField label="總額">
                  <Input
                    inputMode="decimal"
                    value={totalAmount}
                    onChange={(event) => setTotalAmount(event.target.value)}
                    disabled={busy || !!testCase?.groundTruthLockedAt}
                    placeholder="例如 1234.50"
                  />
                </FormField>
                <FormField label="幣別">
                  <Input
                    value={currency}
                    maxLength={3}
                    onChange={(event) =>
                      setCurrency(event.target.value.toUpperCase())
                    }
                    disabled={busy || !!testCase?.groundTruthLockedAt}
                    placeholder="TWD、JPY、USD"
                  />
                </FormField>
              </div>
              <Button
                type="button"
                className="mt-4 w-full min-h-11"
                disabled={
                  busy ||
                  !!testCase?.groundTruthLockedAt ||
                  (!testCase && (!file || !privacyConfirmed))
                }
                onClick={() => void handleSaveGroundTruth()}
              >
                {phase === "saving"
                  ? "正在保存…"
                  : testCase?.groundTruthLockedAt
                    ? "人工正確答案已鎖定"
                    : testCase
                      ? "更新人工正確答案"
                      : "保存人工正確答案"}
              </Button>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <h2 className="font-bold text-foreground">3. 選一個模型辨識</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                預設只跑 Terra；不會自動同時跑三個，也不會失敗後偷換模型。
              </p>
              <div className="mt-4">
                <Select
                  value={model}
                  onValueChange={(value) => setModel(value as InvoiceOcrModel)}
                  disabled={busy}
                >
                  <SelectTrigger className="min-h-11">
                    <SelectValue placeholder="選擇模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {INVOICE_OCR_MODELS.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-3 rounded-xl bg-muted/40 p-3 text-sm">
                <p className="font-medium text-foreground">
                  目前狀態：{PHASE_LABELS[phase]}
                </p>
                {(phase === "uploading" || phase === "analyzing") && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
                  </div>
                )}
              </div>
              <Button
                type="button"
                className="mt-4 w-full min-h-11"
                disabled={busy || !file || !testCase || !privacyConfirmed}
                onClick={startAnalyze}
              >
                {busy && phase !== "saving" ? "處理中，請勿重複按" : "開始辨識"}
              </Button>
              {!file && testCase && (
                <p className="mt-2 text-xs text-amber-700">
                  請重新選擇這筆案例的同一張原圖，系統會核對照片指紋。
                </p>
              )}
            </section>
          </div>
        </div>

        {testCase && run && (
          <InvoiceOcrResultPanel
            testCase={testCase}
            run={run}
            review={review}
            onSaveReview={handleReview}
          />
        )}

        <InvoiceOcrBenchmarkPanel
          summary={summary}
          testCases={testCases}
          downloading={downloading}
          onDownload={handleDownload}
          onSelectCase={handleSelectCase}
        />

        {loadingData && (
          <p className="text-center text-xs text-muted-foreground">
            正在更新測試紀錄…
          </p>
        )}
      </main>

      <BottomNav active="settings" />

      <AlertDialog open={rerunOpen} onOpenChange={setRerunOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定要再次呼叫同一個模型嗎？</AlertDialogTitle>
            <AlertDialogDescription>
              這張照片與相同設定已經有結果。再次執行可能再次使用
              Token；舊結果不會被覆蓋。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setRerunOpen(false);
                void handleAnalyze(true);
              }}
            >
              確認再次辨識
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={unknownRerunOpen} onOpenChange={setUnknownRerunOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              上一筆狀態不明，仍要再次辨識嗎？
            </AlertDialogTitle>
            <AlertDialogDescription>
              上一筆可能已送到 OpenAI 並產生 Token 用量。請先查看 OpenAI
              Usage；若仍繼續，系統只會使用目前選定的
              {model}，不會改用其他模型。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setUnknownRerunOpen(false);
                void handleAnalyze(false, true);
              }}
            >
              確認仍要再次辨識
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
