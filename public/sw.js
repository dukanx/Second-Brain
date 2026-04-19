self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Second Brain", {
      body: data.body ?? "",
      icon: "/SBicon.png",
      badge: "/SBicon.png",
      tag: "review-reminder",
      data: { url: "/brain" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes("/brain") && "focus" in client) return client.focus();
      }
      return clients.openWindow("/brain");
    })
  );
});
