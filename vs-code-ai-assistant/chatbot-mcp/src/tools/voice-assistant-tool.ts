import say from "say";

export function speakText(script: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    say.speak(script, undefined, 1, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
