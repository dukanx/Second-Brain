self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Second Brain", {
      body: data.body ?? "",
      icon: "/SBicon.png",
      badge: "/SBicon.png",
      tag: "review-reminder",
      data: { captureId: data.captureId ?? null },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const captureId = event.notification.data?.captureId;
  const url = captureId ? `/brain?review=${captureId}` : "/brain";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const brainClient = list.find((c) => c.url.includes("/brain"));
      if (brainClient) {
        if (captureId) brainClient.postMessage({ type: "open-review", captureId });
        return brainClient.focus();
      }
      return clients.openWindow(url);
    })
  );
});
