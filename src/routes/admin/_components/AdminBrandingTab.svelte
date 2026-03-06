<script lang="ts">
  import { onMount } from 'svelte';

  interface SiteSettings {
    site_name: string;
    login_message: string;
    logo_url: string;
  }

  let settings = $state<SiteSettings>({ site_name: 'erdmini', login_message: '', logo_url: '' });
  let saving = $state(false);
  let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

  onMount(async () => {
    const res = await fetch('/api/admin/site-settings');
    if (res.ok) settings = await res.json();
  });

  async function save() {
    saving = true;
    message = null;
    try {
      const res = await fetch('/api/admin/site-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        settings = await res.json();
        message = { type: 'success', text: 'Settings saved.' };
      } else {
        const body = await res.json();
        message = { type: 'error', text: body.error || 'Failed to save.' };
      }
    } catch {
      message = { type: 'error', text: 'Network error.' };
    } finally {
      saving = false;
    }
  }
</script>

<div class="section">
  <h2>Branding</h2>
  <p class="section-desc">Customize the site name, logo, and login page message.</p>

  <div class="form-section">
    <h3>Site Name</h3>
    <p class="field-desc">Displayed in the toolbar and login page header.</p>
    <input
      type="text"
      class="inline-input full-width"
      bind:value={settings.site_name}
      placeholder="erdmini"
      maxlength="50"
    />
  </div>

  <div class="form-section">
    <h3>Logo URL</h3>
    <p class="field-desc">Custom logo image URL. Leave empty to use the default logo.</p>
    <input
      type="text"
      class="inline-input full-width"
      bind:value={settings.logo_url}
      placeholder="https://example.com/logo.png"
    />
    {#if settings.logo_url}
      <div class="logo-preview">
        <img src={settings.logo_url} alt="Logo preview" class="preview-img" />
      </div>
    {/if}
  </div>

  <div class="form-section">
    <h3>Login Message</h3>
    <p class="field-desc">Shown on the login page below the logo. E.g. "Welcome to our DB design tool".</p>
    <textarea
      class="inline-input full-width"
      bind:value={settings.login_message}
      placeholder="Welcome message for users..."
      rows="3"
      maxlength="200"
    ></textarea>
  </div>

  <div class="save-row">
    <button class="btn-primary" onclick={save} disabled={saving}>
      {saving ? 'Saving...' : 'Save'}
    </button>
    {#if message}
      <span class={message.type === 'success' ? 'msg-success' : 'msg-error'}>{message.text}</span>
    {/if}
  </div>
</div>

<style>
  .field-desc {
    font-size: 12px;
    color: #64748b;
    margin: 0 0 8px;
  }

  .full-width {
    width: 100%;
    box-sizing: border-box;
  }

  textarea.inline-input {
    resize: vertical;
    font-family: inherit;
  }

  .logo-preview {
    margin-top: 10px;
    padding: 12px;
    background: #0f172a;
    border-radius: 6px;
    display: inline-block;
  }

  .preview-img {
    max-width: 120px;
    max-height: 60px;
    object-fit: contain;
  }

  .save-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 20px;
  }
</style>
