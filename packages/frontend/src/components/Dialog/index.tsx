import React, { createContext, useCallback, useContext, useState } from 'react';

// In-app replacement for window.confirm / window.alert. Use via useDialog():
//   const { confirm, alert } = useDialog();
//   if (await confirm({ title, message, confirmLabel })) { ... }
//   await alert({ title, message });

type DialogVariant = 'confirm' | 'alert';

interface DialogOptions {
  title?: string;
  message: string;
  /** Confirm button label (confirm only). Default "Confirm". */
  confirmLabel?: string;
  /** Cancel button label (confirm only). Default "Cancel". */
  cancelLabel?: string;
  /** Style the confirm button as a destructive action. */
  danger?: boolean;
}

interface DialogState extends DialogOptions {
  variant: DialogVariant;
  resolve: (value: boolean) => void;
}

interface DialogContextValue {
  confirm: (opts: DialogOptions) => Promise<boolean>;
  alert: (opts: DialogOptions) => Promise<void>;
}

const DialogContext = createContext<DialogContextValue>({
  confirm: async () => false,
  alert: async () => undefined,
});

export const useDialog = () => useContext(DialogContext);

export const DialogProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [state, setState] = useState<DialogState | null>(null);

  const confirm = useCallback((opts: DialogOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, variant: 'confirm', resolve });
    });
  }, []);

  const alert = useCallback((opts: DialogOptions): Promise<void> => {
    return new Promise<void>((resolve) => {
      setState({ ...opts, variant: 'alert', resolve: () => resolve() });
    });
  }, []);

  const close = useCallback(
    (result: boolean) => {
      state?.resolve(result);
      setState(null);
    },
    [state],
  );

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
      {state && (
        <div className="dialog-overlay" onClick={() => close(false)}>
          <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
            {state.title && <div className="dialog-title">{state.title}</div>}
            <div className="dialog-message">{state.message}</div>
            <div className="dialog-actions">
              {state.variant === 'confirm' && (
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => close(false)}
                >
                  {state.cancelLabel ?? 'Cancel'}
                </button>
              )}
              <button
                className={`btn btn-sm ${state.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => close(true)}
                autoFocus
              >
                {state.variant === 'confirm'
                  ? (state.confirmLabel ?? 'Confirm')
                  : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};
