import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button as ShadcnButton } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { date, time, titleCase } from "../lib/api";
import type { Job } from "../lib/types";

export const Button = ShadcnButton;

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function ProgressBar({
  value,
  label,
}: {
  value: number | null;
  label: string;
}) {
  return <Progress aria-label={label} value={value} />;
}

export function StatusBadge({ state }: { state: string }) {
  const variant = ["failed", "interrupted"].includes(state)
    ? "destructive"
    : ["transcribing", "preparing", "queued", "saving"].includes(state)
      ? "secondary"
      : "outline";
  return (
    <Badge variant={variant} className={cn("status", state)}>
      {titleCase(state)}
    </Badge>
  );
}

export function HistoryRow({ job }: { job: Job }) {
  return (
    <Link className="history-row" to="/jobs/$jobId" params={{ jobId: job.id }}>
      <span className="file-icon" aria-hidden="true">
        ≋
      </span>
      <span className="history-copy">
        <strong>{job.title}</strong>
        <small>
          {time(job.duration)} · {date(job.created)} · {titleCase(job.preset)}
          {job.detected_language
            ? ` · ${job.detected_language.toUpperCase()}`
            : ""}
        </small>
      </span>
      <StatusBadge state={job.state} />
      <span aria-hidden="true">↗</span>
    </Link>
  );
}

export function EmptyState({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <Empty className="empty-state">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

export type ConfirmRequest = {
  title: string;
  description: string;
  label: string;
  danger?: boolean;
  options?: ReactNode;
};

export function ConfirmDialog({
  request,
  onClose,
}: {
  request: ConfirmRequest | null;
  onClose: (confirmed: boolean) => void;
}) {
  return (
    <AlertDialog
      open={!!request}
      onOpenChange={(open) => {
        if (!open && request) onClose(false);
      }}
    >
      {request && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{request.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {request.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {request.options}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={request.danger ? "destructive" : "default"}
              onClick={() => onClose(true)}
            >
              {request.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}

export function FadeIn({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.1 : 0.18, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </motion.div>
  );
}
