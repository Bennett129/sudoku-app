import { Suspense } from "react";
import { GameScreen } from "@/components/GameScreen";

/**
 * Share link for a bank puzzle: /p/<id>. The game screen reads the id on the
 * client, opens that puzzle (or this device's saved copy of it) and then
 * tidies the address back to "/". Suspense lets the static shell prerender
 * while the URL-dependent part streams in (required with Cache Components).
 */
export default function SharedPuzzlePage() {
  return (
    <Suspense fallback={null}>
      <GameScreen />
    </Suspense>
  );
}
