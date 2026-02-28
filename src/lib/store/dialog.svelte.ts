export interface DialogOptions {
  type: 'confirm' | 'alert';
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'default';
}

interface DialogState {
  options: DialogOptions | null;
  resolve: ((value: boolean) => void) | null;
}

class DialogStore {
  current = $state<DialogState>({ options: null, resolve: null });

  confirm(message: string, opts?: Partial<Omit<DialogOptions, 'type' | 'message'>>): Promise<boolean> {
    return new Promise((resolve) => {
      this.current = {
        options: { type: 'confirm', message, ...opts },
        resolve,
      };
    });
  }

  alert(message: string, opts?: Partial<Omit<DialogOptions, 'type' | 'message'>>): Promise<boolean> {
    return new Promise((resolve) => {
      this.current = {
        options: { type: 'alert', message, ...opts },
        resolve,
      };
    });
  }

  close(result: boolean) {
    this.current.resolve?.(result);
    this.current = { options: null, resolve: null };
  }
}

export const dialogStore = new DialogStore();
