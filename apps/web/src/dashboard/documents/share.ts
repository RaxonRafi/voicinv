// Sending text to a customer through the operating system's share sheet (AGENTS.md §1 rule 6):
// the shopkeeper picks WhatsApp, Messenger, SMS or email and presses send. Where a browser has
// no share sheet, the text is copied so it can be pasted into any of those apps.

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export async function shareText(text: string, title?: string): Promise<ShareOutcome> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text, title });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // Fall through to copying.
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
