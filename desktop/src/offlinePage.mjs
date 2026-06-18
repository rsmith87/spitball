export function buildOfflinePageLoadOptions(appUrl, startCommand) {
  return {
    query: {
      appUrl,
      startCommand,
    },
  };
}
