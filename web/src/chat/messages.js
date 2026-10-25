export function signedInMessage(user) {
  return {
    from: "system",
    text:
      `Signed in as ${user.first} ${user.last}` +
      (user.via === "offline" ? " (checked against the offline demo accounts)" : ""),
    ts: Date.now(),
  };
}
