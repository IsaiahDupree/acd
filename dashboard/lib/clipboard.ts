/**
 * Clipboard Utilities (CF-WC-098)
 *
 * Copy-to-clipboard with feedback.
 */

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    }
  } catch (error) {
    console.error('Failed to copy:', error);
    return false;
  }
}

export async function readFromClipboard(): Promise<string | null> {
  try {
    if (navigator.clipboard) {
      return await navigator.clipboard.readText();
    }
  } catch (error) {
    console.error('Failed to read clipboard:', error);
  }
  return null;
}
