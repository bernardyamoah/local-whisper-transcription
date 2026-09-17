import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { date, time, titleCase } from "../lib/api";
import type { Job } from "../lib/types";

export function Button({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`.trim()} {...props} />;
}

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
  return <progress aria-label={label} max="100" value={value ?? undefined} />;
}

export function StatusBadge({ state }: { state: string }) {
  return <span className={`status ${state}`}>{titleCase(state)}</span>;
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
    <div className="empty-state">
      <h2>{title}</h2>
      {action}
    </div>
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
  const dialog = useRef<HTMLDialogElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (request && dialog.current && !dialog.current.open)
      dialog.current.showModal();
    if (!request && dialog.current?.open) dialog.current.close();
  }, [request]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {request && (
        <dialog ref={dialog} onCancel={() => onClose(false)}>
          <motion.div
            initial={{
              opacity: 0,
              y: reduced ? 0 : 8,
              scale: reduced ? 1 : 0.985,
            }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              duration: reduced ? 0.1 : 0.18,
              ease: [0.23, 1, 0.32, 1],
            }}
          >
            <h2>{request.title}</h2>
            <p>{request.description}</p>
            {request.options}
            <div className="dialog-actions">
              <Button className="secondary" onClick={() => onClose(false)}>
                Cancel
              </Button>
              <Button
                className={request.danger ? "danger" : ""}
                onClick={() => onClose(true)}
              >
                {request.label}
              </Button>
            </div>
          </motion.div>
        </dialog>
      )}
    </AnimatePresence>,
    document.body,
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
