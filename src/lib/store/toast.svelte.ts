export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

let nextId = 0;

class ToastStore {
  toasts = $state<Toast[]>([]);

  show(message: string, type: ToastType = 'info') {
    const id = nextId++;
    this.toasts.push({ id, message, type });
    setTimeout(() => this.remove(id), 3000);
  }

  success(message: string) { this.show(message, 'success'); }
  error(message: string) { this.show(message, 'error'); }
  warning(message: string) { this.show(message, 'warning'); }
  info(message: string) { this.show(message, 'info'); }

  remove(id: number) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }
}

export const toastStore = new ToastStore();
