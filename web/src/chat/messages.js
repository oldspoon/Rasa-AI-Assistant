export function signedInMessage(user) {
  return {
    from: "system",
    text:
      `Signed in as ${user.first} ${user.last}` +
      (user.via === "offline" ? " (checked against the offline demo accounts)" : ""),
    ts: Date.now(),
  };
}

export function serverErrorMessage(reason) {
  return {
    from: "system",
    text: `Something went wrong on the server (${reason}). Please try again.`,
    ts: Date.now(),
  };
}
