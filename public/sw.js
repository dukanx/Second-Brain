self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Second Brain", {
      body: data.body ?? "",
      icon: "/SBicon.png",
      badge: "/SBicon.png",
      tag: data.notifType === "task" ? "task-due" : "review-reminder",
      data: { captureId: data.captureId ?? null, notifType: data.notifType ?? "review" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const captureId = event.notification.data?.captureId;
  const notifType = event.notification.data?.notifType ?? "review";
  const param = notifType === "task" ? "task" : "review";
  const url = captureId ? `/brain?${param}=${captureId}` : "/brain";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const brainClient = list.find((c) => c.url.includes("/brain"));
      if (brainClient) {
        if (captureId) brainClient.postMessage({ type: notifType === "task" ? "open-task" : "open-review", captureId });
        return brainClient.focus();
      }
      return clients.openWindow(url);
    })
  );
});
