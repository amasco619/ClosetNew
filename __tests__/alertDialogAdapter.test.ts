import { createAlertAdapter } from '../lib/alertDialogAdapter';

let failures = 0;
function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`✗ ${message}`);
    failures++;
  } else {
    console.log(`✓ ${message}`);
  }
}

async function run(): Promise<void> {
  let chosen = 1;
  let selectedAction = 0;
  const requests: Array<{ title: string; outsideCancels: boolean; buttons: Array<{ label: string; tone: string }> }> = [];
  const alert = createAlertAdapter(async request => {
    requests.push(request);
    return chosen;
  });

  alert('Remove this piece?', 'The piece will be removed.', [
    { text: 'Keep it', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => { selectedAction++; } },
  ], { cancelable: false });
  await Promise.resolve();
  assert(requests[0]?.title === 'Remove this piece?', 'adapter preserves the alert title');
  assert(requests[0]?.outsideCancels === false, 'destructive alert cannot be dismissed by tapping outside');
  assert(requests[0]?.buttons[0]?.tone === 'quiet' && requests[0]?.buttons[1]?.tone === 'destructive',
    'cancel and destructive button roles are preserved');
  assert(selectedAction === 1, 'selected Alert.alert-compatible callback runs once');

  chosen = 0;
  alert('Amodka');
  await Promise.resolve();
  assert(requests[1]?.buttons[0]?.label === 'Done', 'empty button list gets an accessible Done action');
  assert(requests[1]?.outsideCancels === true, 'non-destructive information alert may be dismissed outside');

  chosen = -1;
  let dismissed = 0;
  alert('Keep editing?', 'No action should run on outside cancellation.', [
    { text: 'Keep editing', style: 'cancel', onPress: () => { selectedAction++; } },
    { text: 'Continue', onPress: () => { selectedAction++; } },
  ], { onDismiss: () => { dismissed++; } });
  await Promise.resolve();
  assert(selectedAction === 1, 'outside cancellation does not invoke an action button');
  assert(dismissed === 1, 'AlertOptions.onDismiss is preserved after dismissal');

  if (failures > 0) process.exit(1);
  console.log('\nAlert adapter checks passed.');
}

void run().catch(error => {
  console.error(error);
  process.exit(1);
});
