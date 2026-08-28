import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';

export function PromptDialog({
  title,
  label,
  defaultValue = '',
  placeholder,
  confirmLabel = 'OK',
  multiline = false,
  onSubmit,
  onCancel,
}: {
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  multiline?: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  const submit = () => onSubmit(value);

  return (
    <Modal
      title={title}
      onClose={onCancel}
      size={multiline ? 'md' : 'sm'}
      initialFocusRef={inputRef}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {label && (
        <label className="mb-1 block text-xs text-muted" htmlFor="prompt-field">
          {label}
        </label>
      )}
      {multiline ? (
        <textarea
          id="prompt-field"
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          className="field min-h-28 w-full"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
      ) : (
        <input
          id="prompt-field"
          ref={inputRef as React.RefObject<HTMLInputElement>}
          className="field w-full"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
      )}
    </Modal>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal
      title={title}
      onClose={onCancel}
      size="sm"
      // Destructive dialogs open on Cancel so a stray Enter cannot delete.
      initialFocusRef={danger ? cancelRef : confirmRef}
      footer={
        <>
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-muted">{message}</p>
    </Modal>
  );
}

/** Two-field condition prompt used by the combat row. */
export function ConditionDialog({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string, rounds: number | null) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [rounds, setRounds] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  return (
    <Modal
      title="Add condition"
      onClose={onCancel}
      size="sm"
      initialFocusRef={nameRef}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!name.trim()}
            onClick={() => {
              const n = Number(rounds);
              onSubmit(name.trim(), rounds && n > 0 ? n : null);
            }}
          >
            Add
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block text-xs text-muted">
          Condition
          <input
            ref={nameRef}
            className="field mt-1 w-full"
            value={name}
            placeholder="Frightened, Poisoned…"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                e.preventDefault();
                const n = Number(rounds);
                onSubmit(name.trim(), rounds && n > 0 ? n : null);
              }
            }}
          />
        </label>
        <label className="block text-xs text-muted">
          Expires in rounds (blank = none)
          <input
            type="number"
            min={1}
            className="field mt-1 w-full"
            value={rounds}
            placeholder="e.g. 3"
            onChange={(e) => setRounds(e.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}
