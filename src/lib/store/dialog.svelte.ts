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

export interface ChoiceOption {
  key: string;
  label: string;
  variant?: 'danger' | 'default' | 'primary';
}

interface ChoiceState {
  options: { title?: string; message: string; choices: ChoiceOption[] } | null;
  resolve: ((key: string | null) => void) | null;
}

class DialogStore {
  current = $state<DialogState>({ options: null, resolve: null });
  choiceState = $state<ChoiceState>({ options: null, resolve: null });

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

  choice(message: string, opts: { title?: string; choices: ChoiceOption[] }): Promise<string | null> {
    return new Promise((resolve) => {
      this.choiceState = {
        options: { message, title: opts.title, choices: opts.choices },
        resolve,
      };
    });
  }

  closeChoice(key: string | null) {
    this.choiceState.resolve?.(key);
    this.choiceState = { options: null, resolve: null };
  }
}

export const dialogStore = new DialogStore();
