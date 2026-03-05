<script lang="ts">
  import { onMount } from 'svelte';
  import * as m from '$lib/paraglide/messages';

  type BackupStats = {
    dbSizeBytes: number;
    userCount: number;
    projectCount: number;
    migrationVersion: number;
  };

  let backupStats = $state<BackupStats | null>(null);
  let backupLoading = $state(false);
  let restoreLoading = $state(false);
  let backupError = $state('');
  let backupSuccess = $state('');

  onMount(() => {
    loadBackupStats();
  });

  async function loadBackupStats() {
    backupError = '';
    const res = await fetch('/api/admin/backup?stats=1');
    if (res.ok) backupStats = await res.json();
  }

  async function downloadBackup() {
    backupLoading = true;
    backupError = '';
    try {
      const res = await fetch('/api/admin/backup');
      if (!res.ok) {
        backupError = 'Failed to download backup';
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'erdmini-backup.db';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      backupLoading = false;
    }
  }

  async function restoreBackup(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!confirm(m.admin_restore_confirm())) {
      input.value = '';
      return;
    }

    restoreLoading = true;
    backupError = '';
    backupSuccess = '';
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/admin/backup', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        backupError = data.error || m.admin_restore_failed();
        return;
      }
      backupSuccess = m.admin_restore_success();
      setTimeout(() => location.reload(), 1500);
    } finally {
      restoreLoading = false;
      input.value = '';
    }
  }
</script>

<section class="section">
  <h2>{m.admin_backup_title()}</h2>

  <div class="form-section">
    <h3>{m.admin_backup_download()}</h3>
    {#if backupStats}
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-label">{m.admin_backup_db_size()}</span>
          <span class="stat-value">{(backupStats.dbSizeBytes / 1024 / 1024).toFixed(2)} MB</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">{m.admin_backup_user_count()}</span>
          <span class="stat-value">{backupStats.userCount}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">{m.admin_backup_project_count()}</span>
          <span class="stat-value">{backupStats.projectCount}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">{m.admin_backup_version()}</span>
          <span class="stat-value">V{String(backupStats.migrationVersion).padStart(3, '0')}</span>
        </div>
      </div>
    {/if}
    <div style="margin-top:12px">
      <button class="btn-primary" onclick={downloadBackup} disabled={backupLoading}>
        {backupLoading ? m.admin_backup_downloading() : m.admin_backup_download()}
      </button>
    </div>
  </div>

  <div class="form-section" style="margin-top:16px">
    <h3>{m.admin_restore_title()}</h3>
    <p class="restore-warning">{m.admin_restore_warning()}</p>
    <div style="margin-top:12px">
      <label class="btn-primary restore-btn">
        {restoreLoading ? '...' : m.admin_restore_upload()}
        <input type="file" accept=".db" style="display:none" onchange={restoreBackup} disabled={restoreLoading} />
      </label>
    </div>
    {#if backupError}<div class="msg-error">{backupError}</div>{/if}
    {#if backupSuccess}<div class="msg-success">{backupSuccess}</div>{/if}
  </div>
</section>
