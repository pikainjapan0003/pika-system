import { useId, type ReactNode } from "react";
import { LockKeyhole } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

export type CalibrationConversion =
  | {
      status: "ready";
      twdDisplay: string;
      exchangeRateDisplay: string;
      exchangeRateLocked: boolean;
    }
  | {
      status: "pending";
      reason: string;
      exchangeRateDisplay?: string;
      exchangeRateLocked: boolean;
    };

export type CalibrationInteraction =
  | {
      mode: "editable";
      onJpyValueChange: (value: string) => void;
      onClear?: () => void;
    }
  | {
      mode: "readOnly";
      reason: string;
    }
  | {
      mode: "disabled";
      reason: string;
    };

export interface DualCurrencyCalibrationFieldProps {
  id?: string;
  jpyValue: string;
  conversion: CalibrationConversion;
  interaction: CalibrationInteraction;
  description?: ReactNode;
  errorMessage?: string;
  className?: string;
}

export function DualCurrencyCalibrationField({
  id,
  jpyValue,
  conversion,
  interaction,
  description,
  errorMessage,
  className,
}: DualCurrencyCalibrationFieldProps) {
  const generatedId = useId();
  const baseId = id ?? `dual-currency-${generatedId}`;
  const jpyId = `${baseId}-jpy`;
  const twdId = `${baseId}-twd`;
  const descriptionId = description ? `${baseId}-description` : undefined;
  const interactionReasonId =
    interaction.mode === "editable" ? undefined : `${baseId}-interaction`;
  const hasJpyValue = jpyValue.trim().length > 0;
  const hasReadyConversion =
    conversion.status === "ready" &&
    conversion.twdDisplay.trim().length > 0 &&
    conversion.exchangeRateDisplay.trim().length > 0 &&
    hasJpyValue;
  const pendingReason = hasReadyConversion
    ? undefined
    : conversion.status === "pending"
      ? conversion.reason
      : !hasJpyValue
        ? "尚未填寫日圓原幣"
        : conversion.exchangeRateDisplay.trim().length === 0
          ? "尚未提供換算匯率"
          : "台幣換算待確認";
  const pendingReasonId = pendingReason ? `${baseId}-pending` : undefined;
  const errorId = errorMessage ? `${baseId}-error` : undefined;
  const jpyDescribedBy = [descriptionId, interactionReasonId, errorId]
    .filter(Boolean)
    .join(" ");
  const twdDescribedBy = [descriptionId, pendingReasonId]
    .filter(Boolean)
    .join(" ");
  const isDisabled = interaction.mode === "disabled";
  const isReadOnly = interaction.mode === "readOnly";
  const isEditable = interaction.mode === "editable";

  return (
    <div
      className={cn(
        "grid gap-4 border border-border bg-card p-4 text-card-foreground sm:grid-cols-2",
        className,
      )}
      data-slot="dual-currency-calibration-field"
    >
      <Field
        data-disabled={isDisabled || undefined}
        data-invalid={Boolean(errorMessage) || undefined}
      >
        <FieldLabel htmlFor={jpyId}>日圓原幣</FieldLabel>
        <InputGroup
          className={cn(
            "min-h-11 rounded-none",
            isDisabled && "bg-muted",
            isReadOnly && "bg-secondary/50",
          )}
          data-disabled={isDisabled || undefined}
        >
          <InputGroupAddon align="inline-start">
            <InputGroupText className="font-mono">JPY</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            id={jpyId}
            value={jpyValue}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            disabled={isDisabled}
            readOnly={isReadOnly}
            aria-invalid={errorMessage ? true : undefined}
            aria-describedby={jpyDescribedBy || undefined}
            onChange={
              isEditable
                ? (event) => interaction.onJpyValueChange(event.target.value)
                : undefined
            }
            className="h-11 min-h-11 rounded-none tabular-nums lining-nums disabled:opacity-100"
          />
          {isEditable && interaction.onClear ? (
            <InputGroupAddon align="inline-end" className="p-0">
              <InputGroupButton
                size="sm"
                className="min-h-11 min-w-11 rounded-none px-3 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                onClick={interaction.onClear}
                disabled={jpyValue.length === 0}
                aria-label="清除日圓金額"
              >
                清除
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
        {errorMessage ? (
          <FieldError id={errorId}>{errorMessage}</FieldError>
        ) : null}
      </Field>

      <Field>
        <FieldLabel htmlFor={twdId}>台幣換算</FieldLabel>
        <InputGroup className="min-h-11 rounded-none bg-secondary/50">
          <InputGroupAddon align="inline-start">
            <InputGroupText className="font-mono">NT$</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            id={twdId}
            value={hasReadyConversion ? conversion.twdDisplay : ""}
            readOnly
            aria-describedby={twdDescribedBy || undefined}
            aria-label="台幣換算結果"
            className="h-11 min-h-11 rounded-none tabular-nums lining-nums"
          />
          {!hasReadyConversion ? (
            <InputGroupAddon align="inline-end">
              <Badge
                variant="outline"
                className="rounded-none border-accent text-accent"
              >
                ◆ 待確認
              </Badge>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      </Field>

      <div
        className="flex min-w-0 flex-col gap-2 border-t border-border pt-3 text-sm sm:col-span-2"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="rounded-none">
            {conversion.exchangeRateLocked ? (
              <LockKeyhole className="size-3.5" aria-hidden="true" />
            ) : null}
            匯率{conversion.exchangeRateLocked ? "已鎖定" : "未鎖定"}
          </Badge>
          {conversion.exchangeRateDisplay ? (
            <span className="tabular-nums lining-nums">
              1 <span className="font-mono">JPY</span> ={" "}
              {conversion.exchangeRateDisplay}{" "}
              <span className="font-mono">TWD</span>
            </span>
          ) : null}
        </div>
        {pendingReason ? (
          <p id={pendingReasonId} className="text-accent">
            待確認：{pendingReason}
          </p>
        ) : null}
        {interaction.mode !== "editable" ? (
          <p id={interactionReasonId} className="text-muted-foreground">
            {interaction.mode === "readOnly" ? "僅供查看" : "目前不可編輯"}：
            {interaction.reason}
          </p>
        ) : null}
        {description ? (
          <FieldDescription id={descriptionId}>{description}</FieldDescription>
        ) : null}
      </div>
    </div>
  );
}
