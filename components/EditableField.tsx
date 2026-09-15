"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Monitor.module.css";

interface EditableFieldProps {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel: string;
}

export default function EditableField({ value, onChange, className, style, ariaLabel }: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEditing = () => {
    setDraft(value);
    setEditing(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed) onChange(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={styles.editInput}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        aria-label={ariaLabel}
      />
    );
  }

  return (
    <span
      className={`${className ?? ""} ${styles.editableCell}`}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        startEditing();
      }}
      role="button"
      tabIndex={0}
      aria-label={`${ariaLabel}: ${value}. Tap to edit.`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          startEditing();
        }
      }}
    >
      {value}
    </span>
  );
}
