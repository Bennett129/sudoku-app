/**
 * Share a bank puzzle's link: the system share sheet where available
 * (phones), otherwise copy to the clipboard.
 */
export type ShareResult = "shared" | "copied" | "failed";

export async function sharePuzzle(bankId: string, label: string): Promise<ShareResult> {
  const url = `${window.location.origin}/p/${bankId}`;
  const data = { title: "Sudoku", text: `Try this ${label} sudoku`, url };
  try {
    if (navigator.share && navigator.canShare?.(data) !== false) {
      await navigator.share(data);
      return "shared";
    }
  } catch (error) {
    if ((error as DOMException)?.name === "AbortError") return "failed"; // user closed the sheet
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
