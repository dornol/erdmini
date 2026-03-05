<script lang="ts">
  import ConstraintModal from './ConstraintModal.svelte';

  interface Props {
    tableId: string;
    onclose: () => void;
  }

  let { tableId, onclose }: Props = $props();
</script>

<ConstraintModal {tableId} mode="index" {onclose} />
