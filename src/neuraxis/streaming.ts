export function parseSseContent(chunk: string): string[] {
  const values: string[] = [];
  for (const line of chunk.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const payload = JSON.parse(data);
      for (const choice of payload.choices || []) {
        const content = choice?.delta?.content;
        if (typeof content === "string") values.push(content);
      }
    } catch {
      continue;
    }
  }
  return values;
}
